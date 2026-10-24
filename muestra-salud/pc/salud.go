// Antares · Salud de la compu (dentro del portero). Cada 60 s mide CPU, RAM, discos, temperatura (LibreHardwareMonitor
// si está corriendo en 127.0.0.1:8085), Wi-Fi, ping, Tailscale/Funnel y servicios; guarda 7 días en D:\Antares\salud
// (historial-AAAA-MM-DD.jsonl) y una bitácora de alertas (alertas.jsonl) con inicio y fin.
// Rutas (con token): /salud  /salud/historial?horas=24
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

var sdir = envOr("ANTARES_SALUD_DIR", `D:\Antares\salud`)

const (
	discoMinGB   = 50.0
	tempAviso    = 75.0
	tempAlerta   = 85.0
	redGraciaSeg = 120.0 // caídas de Wi-Fi/internet: alerta si duran más de 2 min
	funnelURL    = "https://antares.tail1d77f2.ts.net/ping"
)

type Disco struct {
	Letra   string  `json:"letra"`
	LibreGB float64 `json:"libreGB"`
	TotalGB float64 `json:"totalGB"`
}
type Muestra struct {
	T         time.Time `json:"t"`
	CPU       float64   `json:"cpu"`
	TempCPU   *float64  `json:"tempCPU"`
	TempSSD   *float64  `json:"tempSSD,omitempty"`
	VidaSSD   *float64  `json:"vidaSSD,omitempty"`
	RAMMB     float64   `json:"ramMB"`
	RAMTotMB  float64   `json:"ramTotalMB"`
	Discos    []Disco   `json:"discos"`
	Wifi      wifiInfo  `json:"wifi"`
	Ping1111  float64   `json:"ping1111"`
	PingGoog  float64   `json:"pingGoogle"`
	Internet  bool      `json:"internet"`
	TSOnline  *bool     `json:"tailscale"`
	Funnel    *bool     `json:"funnel"`
	Ollama    bool      `json:"ollama"`
	Noticias  string    `json:"noticias"`
	UptimeH   float64   `json:"uptimeH"`
	PorteroMB float64   `json:"porteroMB"`
	PorteroCPU float64  `json:"porteroCPU"`
}
type Alerta struct {
	Clave  string     `json:"clave"`
	Nivel  string     `json:"nivel"` // aviso | alerta | evento
	Texto  string     `json:"texto"`
	Inicio time.Time  `json:"inicio"`
	Fin    *time.Time `json:"fin,omitempty"`
	Activa bool       `json:"activa"`
	DurSeg float64    `json:"duracionSeg,omitempty"`
}

var (
	smu       sync.RWMutex
	hist      []Muestra
	actual    Muestra
	activas   = map[string]*Alerta{}
	pendiente = map[string]time.Time{}
	bitacora  []Alerta
	tsCache   *bool
	fnCache   *bool
	tsCuando  time.Time
	cpuProcPrev time.Duration
	cpuProcT    time.Time
)

func f64(v float64) *float64 { return &v }
func bptr(v bool) *bool      { return &v }
func r1(v float64) float64   { return math.Round(v*10) / 10 }

type lhmNodo struct {
	Text, Value, Type, SensorId string
	Children                    []lhmNodo
}

// temperaturas desde LibreHardwareMonitor (servidor web local 127.0.0.1:8085). nil = no disponible.
func temperaturas() (cpu, ssd, vida *float64) {
	c := &http.Client{Timeout: 3 * time.Second}
	r, err := c.Get("http://127.0.0.1:8085/data.json")
	if err != nil { return }
	defer r.Body.Close()
	var raiz lhmNodo
	if json.NewDecoder(r.Body).Decode(&raiz) != nil { return }
	num := func(s string) (float64, bool) {
		s = strings.TrimSpace(strings.NewReplacer("°C", "", "%", "", ",", ".").Replace(s))
		v, err := strconv.ParseFloat(s, 64)
		return v, err == nil && v > 0
	}
	var pkg, maxCore float64
	var walk func(n lhmNodo, ctx string)
	walk = func(n lhmNodo, ctx string) {
		id := strings.ToLower(n.SensorId)
		if strings.HasPrefix(id, "/intelcpu") || strings.HasPrefix(id, "/amdcpu") { ctx = "cpu" }
		if strings.HasPrefix(id, "/nvme") || strings.HasPrefix(id, "/hdd") || strings.HasPrefix(id, "/ssd") || strings.HasPrefix(id, "/storage") { ctx = "disco" }
		if strings.Contains(id, "/temperature/") {
			if v, ok := num(n.Value); ok {
				t := strings.ToLower(n.Text)
				if ctx == "cpu" {
					if strings.Contains(t, "package") { pkg = v } else if strings.Contains(t, "core") && !strings.Contains(t, "distance") && v > maxCore { maxCore = v }
				} else if ctx == "disco" && ssd == nil { ssd = f64(v) }
			}
		}
		if ctx == "disco" && vida == nil && strings.Contains(id, "/level/") && strings.Contains(strings.ToLower(n.Text), "life") {
			if v, ok := num(n.Value); ok { vida = f64(v) }
		}
		for _, h := range n.Children { walk(h, ctx) }
	}
	walk(raiz, "")
	if pkg == 0 { pkg = maxCore }
	if pkg > 0 { cpu = f64(pkg) }
	return
}

func tailscale() (online, funnel *bool) {
	if !tsCuando.IsZero() && time.Since(tsCuando) < 2*time.Minute { return tsCache, fnCache }
	tsCuando = time.Now()
	tsCache, fnCache = nil, nil
	if out, err := ejecutar(15*time.Second, `C:\Program Files\Tailscale\tailscale.exe`, "status", "--json"); err == nil {
		var st struct {
			BackendState string
			Self         struct{ Online bool }
		}
		if json.Unmarshal(out, &st) == nil { tsCache = bptr(st.BackendState == "Running" && st.Self.Online) }
	}
	c := &http.Client{Timeout: 10 * time.Second}
	if r, err := c.Get(funnelURL); err == nil { r.Body.Close(); fnCache = bptr(r.StatusCode == 200) } else { fnCache = bptr(false) }
	return tsCache, fnCache
}

func ollamaVivo() bool {
	c := &http.Client{Timeout: 3 * time.Second}
	r, err := c.Get(upstream + "/api/version")
	if err != nil { return false }
	r.Body.Close()
	return r.StatusCode == 200
}

var pasoActual string

func paso(n string) { pasoActual = n; if os.Getenv("ANTARES_SALUD_DEBUG") != "" { log.Println("salud paso:", n) } }

func medir() Muestra {
	paso("cpu")
	m := Muestra{T: time.Now(), CPU: r1(cpuPct())}
	paso("temperaturas")
	m.TempCPU, m.TempSSD, m.VidaSSD = temperaturas()
	paso("memoria")
	tot, us := memoria()
	m.RAMMB, m.RAMTotMB = math.Round(us), math.Round(tot)
	for _, l := range []string{"C", "D"} {
		if lb, t, ok := discoGB(l); ok { m.Discos = append(m.Discos, Disco{l, r1(lb), r1(t)}) }
	}
	paso("wifi")
	m.Wifi = wifi()
	paso("ping")
	m.Ping1111 = pingMs("1.1.1.1")
	m.PingGoog = pingMs("google.com")
	m.Internet = m.Ping1111 >= 0 || m.PingGoog >= 0
	paso("tailscale")
	m.TSOnline, m.Funnel = tailscale()
	paso("ollama")
	m.Ollama = ollamaVivo()
	paso("noticias")
	nmu.RLock(); u := ultima; nmu.RUnlock()
	paso("fin")
	switch {
	case u.IsZero():
		m.Noticias = "sin datos"
	case time.Since(u) < 45*time.Minute:
		m.Noticias = "ok"
	default:
		m.Noticias = "atrasado"
	}
	m.UptimeH = r1(uptimeS() / 3600)
	m.PorteroMB = r1(memProceso())
	if cp, ok := cpuProceso(); ok {
		if !cpuProcT.IsZero() { m.PorteroCPU = math.Round(float64(cp-cpuProcPrev)/float64(time.Since(cpuProcT))*10000/float64(numCPU())) / 100 }
		cpuProcPrev, cpuProcT = cp, time.Now()
	}
	return m
}

func condicion(clave string, presente bool, nivel, texto string, gracia float64, ahora time.Time) {
	a := activas[clave]
	if presente {
		if a != nil { a.Texto, a.Nivel = texto, nivel; return }
		ini := ahora
		if gracia > 0 {
			p, ok := pendiente[clave]
			if !ok { pendiente[clave] = ahora; return }
			if ahora.Sub(p).Seconds() < gracia { return }
			delete(pendiente, clave)
			ini = p
		}
		nueva := &Alerta{Clave: clave, Nivel: nivel, Texto: texto, Inicio: ini, Activa: true}
		activas[clave] = nueva
		anotar(*nueva)
		return
	}
	if ini, ok := pendiente[clave]; ok { // caída corta (< 2 min): queda en la bitácora como evento
		delete(pendiente, clave)
		if strings.HasPrefix(clave, "red") {
			fin := ahora
			anotar(Alerta{Clave: clave, Nivel: "evento", Texto: texto + " (caída corta)", Inicio: ini, Fin: &fin, DurSeg: math.Round(fin.Sub(ini).Seconds())})
		}
	}
	if a != nil {
		fin := ahora
		a.Fin, a.Activa, a.DurSeg = &fin, false, math.Round(fin.Sub(a.Inicio).Seconds())
		anotar(*a)
		delete(activas, clave)
	}
}

func anotar(a Alerta) {
	bitacora = append(bitacora, a)
	if len(bitacora) > 300 { bitacora = bitacora[len(bitacora)-300:] }
	if f, err := os.OpenFile(filepath.Join(sdir, "alertas.jsonl"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600); err == nil {
		b, _ := json.Marshal(a)
		f.Write(append(b, '\n'))
		f.Close()
	}
}

func evaluar(m Muestra) {
	ahora := m.T
	for _, d := range m.Discos {
		condicion("disco"+d.Letra, d.LibreGB < discoMinGB, "alerta", fmt.Sprintf("Disco %s: quedan %.0f GB libres (mínimo %.0f GB)", d.Letra, d.LibreGB, discoMinGB), 0, ahora)
	}
	if m.TempCPU != nil {
		t := *m.TempCPU
		condicion("tempAlerta", t >= tempAlerta, "alerta", fmt.Sprintf("CPU muy caliente: %.0f °C", t), 0, ahora)
		condicion("tempAviso", t >= tempAviso && t < tempAlerta, "aviso", fmt.Sprintf("CPU caliente: %.0f °C", t), 0, ahora)
	}
	if m.TempSSD != nil { condicion("tempSSD", *m.TempSSD >= 70, "aviso", fmt.Sprintf("SSD caliente: %.0f °C", *m.TempSSD), 0, ahora) }
	condicion("redWifi", m.Wifi.Encontrado && !m.Wifi.Conectado, "alerta", "Wi-Fi desconectado", redGraciaSeg, ahora)
	condicion("redInternet", !m.Internet && (!m.Wifi.Encontrado || m.Wifi.Conectado), "alerta", "Sin internet (no responden 1.1.1.1 ni google.com)", redGraciaSeg, ahora)
	condicion("tailscale", m.TSOnline != nil && !*m.TSOnline && m.Internet, "aviso", "Tailscale sin conexión", redGraciaSeg, ahora)
	condicion("funnel", m.Funnel != nil && !*m.Funnel && m.Internet, "aviso", "La dirección pública (Funnel) no responde", redGraciaSeg, ahora)
	condicion("ollama", !m.Ollama, "aviso", "El cerebro (Ollama) no responde", redGraciaSeg, ahora)
	condicion("noticias", m.Noticias == "atrasado", "aviso", "El recolector de noticias está atrasado", 0, ahora)
}

func guardarMuestra(m Muestra) {
	p := filepath.Join(sdir, "historial-"+m.T.Format("2006-01-02")+".jsonl")
	if f, err := os.OpenFile(p, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600); err == nil {
		b, _ := json.Marshal(m)
		f.Write(append(b, '\n'))
		f.Close()
	}
}

func cargarHistorial() {
	hist = hist[:0]
	corte := time.Now().Add(-7 * 24 * time.Hour)
	fs, _ := filepath.Glob(filepath.Join(sdir, "historial-*.jsonl"))
	sort.Strings(fs)
	for _, p := range fs {
		d, err := time.ParseInLocation("2006-01-02", strings.TrimSuffix(strings.TrimPrefix(filepath.Base(p), "historial-"), ".jsonl"), time.Local)
		if err == nil && d.Before(corte.Add(-24*time.Hour)) { os.Remove(p); continue }
		f, err := os.Open(p)
		if err != nil { continue }
		sc := bufio.NewScanner(f)
		sc.Buffer(make([]byte, 64<<10), 1<<20)
		for sc.Scan() {
			var m Muestra
			if json.Unmarshal(sc.Bytes(), &m) == nil && m.T.After(corte) { hist = append(hist, m) }
		}
		f.Close()
	}
}

func cargarBitacora() {
	f, err := os.Open(filepath.Join(sdir, "alertas.jsonl"))
	if err != nil { return }
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		var a Alerta
		if json.Unmarshal(sc.Bytes(), &a) == nil { a.Activa = false; bitacora = append(bitacora, a) } // al reiniciar se vuelve a evaluar todo
	}
	if len(bitacora) > 300 { bitacora = bitacora[len(bitacora)-300:] }
}

func iniciarSalud() {
	os.MkdirAll(sdir, 0700)
	smu.Lock(); cargarHistorial(); cargarBitacora(); smu.Unlock()
	cpuPct()
	go func() {
		time.Sleep(5 * time.Second)
		dia := time.Now().Day()
		for {
			m := medir()
			smu.Lock()
			actual = m
			hist = append(hist, m)
			corte := time.Now().Add(-7 * 24 * time.Hour)
			for len(hist) > 0 && hist[0].T.Before(corte) { hist = hist[1:] }
			evaluar(m)
			if m.T.Day() != dia { dia = m.T.Day(); cargarHistorial() } // limpia archivos de más de 7 días
			smu.Unlock()
			guardarMuestra(m)
			time.Sleep(60 * time.Second)
		}
	}()
	log.Println("salud: midiendo cada 60 s en", sdir)
}

func rutasSalud(w http.ResponseWriter, r *http.Request) bool {
	switch r.URL.Path {
	case "/salud":
		smu.RLock()
		act := []Alerta{}
		for _, a := range activas { act = append(act, *a) }
		sort.Slice(act, func(i, j int) bool { return act[i].Inicio.Before(act[j].Inicio) })
		ev := []Alerta{}
		for i := len(bitacora) - 1; i >= 0 && len(ev) < 30; i-- { ev = append(ev, bitacora[i]) }
		m := actual
		smu.RUnlock()
		responderJSON(w, map[string]any{"ahora": m, "alertas": act, "bitacora": ev,
			"umbrales": map[string]float64{"discoMinGB": discoMinGB, "tempAviso": tempAviso, "tempAlerta": tempAlerta, "redGraciaSeg": redGraciaSeg},
			"tempDisponible": m.TempCPU != nil, "paso": pasoActual})
	case "/salud/historial":
		horas, _ := strconv.Atoi(r.URL.Query().Get("horas"))
		if horas <= 0 || horas > 168 { horas = 24 }
		paso := time.Duration(horas) * time.Hour / 288
		desde := time.Now().Add(-time.Duration(horas) * time.Hour)
		type P struct {
			T      time.Time `json:"t"`
			CPU    float64   `json:"cpu"`
			Temp   *float64  `json:"temp"`
			RAM    float64   `json:"ramMB"`
			Ping   float64   `json:"ping"`
			Senal  int       `json:"senal"`
			Net    bool      `json:"internet"`
			Wifi   bool      `json:"wifi"`
			LibreC float64   `json:"libreC"`
			LibreD float64   `json:"libreD"`
		}
		out := []P{}
		var ult time.Time
		smu.RLock()
		for _, m := range hist {
			if m.T.Before(desde) || (m.T.Sub(ult) < paso && m.Internet && m.Wifi.Conectado) { continue } // las caídas siempre se incluyen
			ult = m.T
			p := P{T: m.T, CPU: m.CPU, Temp: m.TempCPU, RAM: m.RAMMB, Ping: m.Ping1111, Senal: m.Wifi.SenalPct, Net: m.Internet, Wifi: m.Wifi.Conectado}
			for _, d := range m.Discos { if d.Letra == "C" { p.LibreC = d.LibreGB } else { p.LibreD = d.LibreGB } }
			out = append(out, p)
		}
		smu.RUnlock()
		responderJSON(w, map[string]any{"horas": horas, "puntos": out})
	default:
		return false
	}
	return true
}
