//go:build windows

package main

import (
	"net"
	"strings"
	"os/exec"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	k32         = windows.NewLazySystemDLL("kernel32.dll")
	pSysTimes   = k32.NewProc("GetSystemTimes")
	pMemStatus  = k32.NewProc("GlobalMemoryStatusEx")
	pTick64     = k32.NewProc("GetTickCount64")
	iph         = windows.NewLazySystemDLL("iphlpapi.dll")
	pIcmpCreate = iph.NewProc("IcmpCreateFile")
	pIcmpSend   = iph.NewProc("IcmpSendEcho")
	pIcmpClose  = iph.NewProc("IcmpCloseHandle")
	wl          = windows.NewLazySystemDLL("wlanapi.dll")
	pWOpen      = wl.NewProc("WlanOpenHandle")
	pWEnum      = wl.NewProc("WlanEnumInterfaces")
	pWQuery     = wl.NewProc("WlanQueryInterface")
	pWFree      = wl.NewProc("WlanFreeMemory")
	pWClose     = wl.NewProc("WlanCloseHandle")
	pMemInfo    = windows.NewLazySystemDLL("psapi.dll").NewProc("GetProcessMemoryInfo")
)

func ft(f windows.Filetime) uint64 { return uint64(f.HighDateTime)<<32 | uint64(f.LowDateTime) }

var cpuPrev [3]uint64

func cpuPct() float64 {
	var idle, kern, user windows.Filetime
	pSysTimes.Call(uintptr(unsafe.Pointer(&idle)), uintptr(unsafe.Pointer(&kern)), uintptr(unsafe.Pointer(&user)))
	i, k, u := ft(idle), ft(kern), ft(user)
	di, dk, du := i-cpuPrev[0], k-cpuPrev[1], u-cpuPrev[2]
	first := cpuPrev[0] == 0
	cpuPrev = [3]uint64{i, k, u}
	if first || dk+du == 0 { return -1 }
	return float64(dk+du-di) * 100 / float64(dk+du)
}

func memoria() (totalMB, usadaMB float64) {
	var m struct {
		Len, Load                             uint32
		Total, Avail, PTot, PAv, VTot, VAv, X uint64
	}
	m.Len = uint32(unsafe.Sizeof(m))
	pMemStatus.Call(uintptr(unsafe.Pointer(&m)))
	return float64(m.Total) / 1048576, float64(m.Total-m.Avail) / 1048576
}

func discoGB(letra string) (libre, total float64, ok bool) {
	var free, tot, tf uint64
	p, _ := windows.UTF16PtrFromString(letra + `:\`)
	if windows.GetDiskFreeSpaceEx(p, &free, &tot, &tf) != nil { return 0, 0, false }
	return float64(tf) / 1e9, float64(tot) / 1e9, true
}

func uptimeS() float64 { r, _, _ := pTick64.Call(); return float64(r) / 1000 }

// ping ICMP sin permisos de administrador (IcmpSendEcho). Devuelve ms o -1.
func pingMs(host string) float64 {
	ips, err := net.LookupIP(host)
	if err != nil { return -1 }
	var ip4 net.IP
	for _, ip := range ips { if v := ip.To4(); v != nil { ip4 = v; break } }
	if ip4 == nil { return -1 }
	h, _, _ := pIcmpCreate.Call()
	if h == 0 || h == ^uintptr(0) { return -1 }
	defer pIcmpClose.Call(h)
	addr := *(*uint32)(unsafe.Pointer(&ip4[0]))
	data := []byte("antares")
	reply := make([]byte, 256)
	n, _, _ := pIcmpSend.Call(h, uintptr(addr), uintptr(unsafe.Pointer(&data[0])), uintptr(len(data)), 0, uintptr(unsafe.Pointer(&reply[0])), uintptr(len(reply)), 2000)
	if n == 0 { return -1 }
	if *(*uint32)(unsafe.Pointer(&reply[4])) != 0 { return -1 }
	return float64(*(*uint32)(unsafe.Pointer(&reply[8])))
}

type wifiInfo struct {
	Nombre     string  `json:"nombre"`
	Conectado  bool    `json:"conectado"`
	VelMbps    float64 `json:"velocidadMbps"`
	SSID       string  `json:"ssid,omitempty"`
	SenalPct   int     `json:"senalPct"` // -1 = no disponible
	RxMbps     float64 `json:"rxMbps,omitempty"`
	NotaSenal  string  `json:"notaSenal,omitempty"`
	Encontrado bool    `json:"encontrado"`
}

func wifi() wifiInfo {
	w := wifiInfo{SenalPct: -1}
	var sz uint32 = 15000
	for i := 0; i < 3; i++ {
		buf := make([]byte, sz)
		a := (*windows.IpAdapterAddresses)(unsafe.Pointer(&buf[0]))
		err := windows.GetAdaptersAddresses(windows.AF_UNSPEC, 0, 0, a, &sz)
		if err == windows.ERROR_BUFFER_OVERFLOW { continue }
		if err != nil { break }
		for ; a != nil; a = a.Next {
			if a.IfType != 71 { continue } // IEEE 802.11
			nom := windows.UTF16PtrToString(a.FriendlyName)
			desc := windows.UTF16PtrToString(a.Description)
			if strings.Contains(nom, "*") || strings.Contains(strings.ToLower(desc), "virtual") || strings.Contains(strings.ToLower(desc), "direct") { continue } // adaptadores virtuales (Wi-Fi Direct)
			arriba := a.OperStatus == windows.IfOperStatusUp
			if w.Encontrado && !arriba { continue }
			w.Encontrado, w.Nombre, w.Conectado = true, nom, arriba
			if arriba { w.VelMbps = float64(a.ReceiveLinkSpeed) / 1e6; break }
		}
		break
	}
	wlanDatos(&w)
	return w
}

// SSID y señal: Windows 11 solo los da a programas de escritorio con «Ubicación» permitida (si no, error 5).
func wlanDatos(w *wifiInfo) {
	var ver uint32
	var h windows.Handle
	if r, _, _ := pWOpen.Call(2, 0, uintptr(unsafe.Pointer(&ver)), uintptr(unsafe.Pointer(&h))); r != 0 { w.NotaSenal = "servicio WLAN no disponible"; return }
	defer pWClose.Call(uintptr(h), 0)
	var lista uintptr
	if r, _, _ := pWEnum.Call(uintptr(h), 0, uintptr(unsafe.Pointer(&lista))); r != 0 || lista == 0 { return }
	defer pWFree.Call(lista)
	if *(*uint32)(unsafe.Pointer(lista)) == 0 { return }
	guid := lista + 8 // WLAN_INTERFACE_INFO_LIST: dwNumberOfItems, dwIndex, InterfaceInfo[0].InterfaceGuid
	var dsz uint32
	var data uintptr
	r, _, _ := pWQuery.Call(uintptr(h), guid, 7, 0, uintptr(unsafe.Pointer(&dsz)), uintptr(unsafe.Pointer(&data)), 0)
	if r != 0 {
		if r == 5 { w.NotaSenal = "Windows no deja leer la señal: active Configuración › Privacidad › Ubicación › «Permitir que las aplicaciones de escritorio accedan a su ubicación»" } else { w.NotaSenal = "sin datos de señal (" + syscall.Errno(r).Error() + ")" }
		return
	}
	defer pWFree.Call(data)
	if dsz < 588 { return }
	b := unsafe.Slice((*byte)(unsafe.Pointer(data)), dsz)
	l := int(*(*uint32)(unsafe.Pointer(&b[520])))
	if l > 32 { l = 32 }
	w.SSID = string(b[524 : 524+l])
	w.SenalPct = int(*(*uint32)(unsafe.Pointer(&b[576])))
	w.RxMbps = float64(*(*uint32)(unsafe.Pointer(&b[580]))) / 1000
}

func ejecutar(timeout time.Duration, prog string, args ...string) ([]byte, error) {
	c := exec.Command(prog, args...)
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000} // sin ventana
	done := make(chan struct{})
	var out []byte
	var err error
	go func() { out, err = c.Output(); close(done) }()
	select {
	case <-done:
		return out, err
	case <-time.After(timeout):
		if c.Process != nil { c.Process.Kill() }
		return nil, syscall.ETIMEDOUT
	}
}

func memProceso() float64 {
	var c struct {
		Cb, PageFaultCount                                         uint32
		PeakWS, WS, QPP, QP, QPNP, QNP, PagefileUsage, PeakPF uintptr
	}
	c.Cb = uint32(unsafe.Sizeof(c))
	h, _ := windows.GetCurrentProcess()
	pMemInfo.Call(uintptr(h), uintptr(unsafe.Pointer(&c)), uintptr(c.Cb))
	return float64(c.WS) / 1048576
}

func numCPU() int { return runtimeNumCPU() }

func cpuProceso() (time.Duration, bool) {
	h, _ := windows.GetCurrentProcess()
	var c, e, k, u windows.Filetime
	if windows.GetProcessTimes(h, &c, &e, &k, &u) != nil { return 0, false }
	return time.Duration((ft(k) + ft(u)) * 100), true
}
