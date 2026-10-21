// Antares · portero del cerebro de la PC. Escucha en 127.0.0.1:11435 y reenvía a Ollama (127.0.0.1:11434)
// solo si la petición trae el token correcto (cabecera X-Antares-Token o Authorization: Bearer).
// El token vive en D:\Antares\cerebro\token.txt (se crea al primer arranque). Solo se permiten rutas de chat.
package main

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var (
	dir      = envOr("ANTARES_CEREBRO_DIR", `D:\Antares\cerebro`)
	listen   = envOr("ANTARES_PROXY_ADDR", "127.0.0.1:11435")
	upstream = envOr("ANTARES_OLLAMA", "http://127.0.0.1:11434")
	origins  = strings.Split(envOr("ANTARES_ORIGINS", "https://rodolfovelasquez719-del.github.io"), ",")
	allowed  = map[string]bool{"/api/chat": true, "/api/generate": true, "/api/tags": true, "/api/version": true, "/api/ps": true}
)

func envOr(k, d string) string { if v := os.Getenv(k); v != "" { return v }; return d }

func token() string {
	p := filepath.Join(dir, "token.txt")
	if b, err := os.ReadFile(p); err == nil && len(strings.TrimSpace(string(b))) >= 32 {
		return strings.TrimSpace(string(b))
	}
	r := make([]byte, 24); rand.Read(r)
	t := "ant_" + hex.EncodeToString(r)
	if err := os.WriteFile(p, []byte(t+"\r\n"), 0600); err != nil { log.Fatal("no pude guardar el token: ", err) }
	log.Println("token nuevo guardado en", p)
	return t
}

func main() {
	os.MkdirAll(dir, 0700)
	lf, _ := os.OpenFile(filepath.Join(dir, "portero.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if lf != nil { log.SetOutput(lf) }
	tok := []byte(token())
	u, _ := url.Parse(upstream)
	rp := httputil.NewSingleHostReverseProxy(u)
	rp.FlushInterval = -1 // streaming: cada palabra sale apenas llega
	orig := rp.Director
	rp.Director = func(r *http.Request) {
		orig(r); r.Host = u.Host
		r.Header.Del("Origin"); r.Header.Del("Referer") // Ollama ve una llamada local
		r.Header.Del("X-Antares-Token"); r.Header.Del("Authorization")
	}
	rp.ModifyResponse = func(resp *http.Response) error { resp.Header.Del("Access-Control-Allow-Origin"); return nil }
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		o := r.Header.Get("Origin")
		for _, a := range origins {
			if o != "" && strings.EqualFold(o, strings.TrimSpace(a)) {
				w.Header().Set("Access-Control-Allow-Origin", o)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Antares-Token, Authorization")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
				w.Header().Set("Access-Control-Max-Age", "600")
			}
		}
		if r.Method == http.MethodOptions { w.WriteHeader(204); return }
		if r.URL.Path == "/ping" { w.Header().Set("Content-Type", "text/plain"); w.Write([]byte("ok")); return } // solo dice «encendida», sin datos
		t := r.Header.Get("X-Antares-Token")
		if t == "" { t = strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ") }
		if subtle.ConstantTimeCompare([]byte(t), tok) != 1 {
			time.Sleep(800 * time.Millisecond)
			log.Println("rechazado (token)", r.RemoteAddr, r.Header.Get("Cf-Connecting-Ip"), r.Method, r.URL.Path)
			http.Error(w, "no autorizado", http.StatusUnauthorized); return
		}
		if r.Method == http.MethodGet && rutasBuscador(w, r) { return }
		if !allowed[r.URL.Path] { http.Error(w, "ruta no permitida", http.StatusForbidden); return }
		r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
		rp.ServeHTTP(w, r)
	})
	iniciarBuscador()
	log.Println("portero escuchando en", listen, "→", upstream)
	srv := &http.Server{Addr: listen, Handler: h, ReadHeaderTimeout: 10 * time.Second}
	log.Fatal(srv.ListenAndServe())
}
