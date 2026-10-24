//go:build !windows

package main

import "time"

type wifiInfo struct {
	Nombre     string  `json:"nombre"`
	Conectado  bool    `json:"conectado"`
	VelMbps    float64 `json:"velocidadMbps"`
	SSID       string  `json:"ssid,omitempty"`
	SenalPct   int     `json:"senalPct"`
	RxMbps     float64 `json:"rxMbps,omitempty"`
	NotaSenal  string  `json:"notaSenal,omitempty"`
	Encontrado bool    `json:"encontrado"`
}

func cpuPct() float64                                                 { return 5 }
func memoria() (float64, float64)                                     { return 10000, 6000 }
func discoGB(l string) (float64, float64, bool)                       { if l == "C" { return 40, 146, true }; return 200, 319, true }
func uptimeS() float64                                                { return 3600 }
func pingMs(h string) float64                                         { return 20 }
func wifi() wifiInfo                                                  { return wifiInfo{Nombre: "Wi-Fi", Conectado: true, VelMbps: 144, SenalPct: -1, Encontrado: true} }
func ejecutar(t time.Duration, p string, a ...string) ([]byte, error) { return nil, nil }
func memProceso() float64                                             { return 20 }
func numCPU() int                        { return runtimeNumCPU() }
func cpuProceso() (time.Duration, bool) { return 0, false }
