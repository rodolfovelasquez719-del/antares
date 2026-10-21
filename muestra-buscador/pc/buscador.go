// Antares · buscador propio (dentro del portero, sin puertos nuevos ni Docker).
//  - Recolector de noticias de Costa Rica: RSS públicos cada 30 min → D:\Antares\buscador\noticias.json (7 días).
//  - /noticias?q=&horas=  → noticias locales (filtro sin tildes).
//  - /buscar?q=           → metabúsqueda: noticias locales + DuckDuckGo Lite + Wikipedia ES (+ tipo de cambio de Hacienda).
//  - /buscador/estado     → fuentes, cantidades, última recolección.
// Todo detrás del token del portero. Tasa baja: feeds en serie con pausa; DuckDuckGo máx. 1 consulta cada 3 s y caché 15 min.
package main

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

var bdir = envOr("ANTARES_BUSCADOR_DIR", `D:\Antares\buscador`)

const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AntaresBuscador/1.0 (uso personal)"

type fuente struct{ Nombre, URL string }

var fuentes = []fuente{
	{"La Nación", "https://www.nacion.com/arc/outboundfeeds/rss/?outputType=xml"},
	{"El Financiero", "https://www.elfinancierocr.com/arc/outboundfeeds/rss/?outputType=xml"},
	{"El Observador", "https://observador.cr/feed/"},
	{"Delfino", "https://delfino.cr/feed"},
	{"El Mundo CR", "https://www.elmundo.cr/feed/"},
	{"Semanario Universidad", "https://semanariouniversidad.com/feed/"},
	{"Monumental", "https://www.monumental.co.cr/feed/"},
	{"Repretel", "https://www.repretel.com/feed/"},
	// sin RSS propio: titulares vía Google Noticias (búsqueda por sitio)
	{"CRHoy", gn("site:crhoy.com")},
	{"Teletica", gn("site:teletica.com")},
	{"AmeliaRueda", gn("site:ameliarueda.com")},
	{"Google Noticias CR", gn("Costa Rica")},
}

func gn(q string) string {
	return "https://news.google.com/rss/search?q=" + url.QueryEscape(q+" when:2d") + "&hl=es-419&gl=CR&ceid=CR:es-419"
}

type Noticia struct {
	Titulo  string    `json:"titulo"`
	Resumen string    `json:"resumen"`
	Link    string    `json:"link"`
	Fuente  string    `json:"fuente"`
	Fecha   time.Time `json:"fecha"`
}

var (
	nmu      sync.RWMutex
	noticias []Noticia
	ultima   time.Time
	estadoF  = map[string]string{}
	cli      = &http.Client{Timeout: 20 * time.Second}
)

var (
	reTag = regexp.MustCompile(`(?s)<[^>]*>`)
	reSp  = regexp.MustCompile(`\s+`)
)

func limpio(s string) string {
	s = reTag.ReplaceAllString(s, " ")
	s = html.UnescapeString(html.UnescapeString(s))
	return strings.TrimSpace(reSp.ReplaceAllString(s, " "))
}
func corta(s string, n int) string {
	r := []rune(s)
	if len(r) <= n { return s }
	return string(r[:n]) + "…"
}

var sinTilde = strings.NewReplacer("á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ü", "u", "ñ", "n", "Á", "a", "É", "e", "Í", "i", "Ó", "o", "Ú", "u", "Ñ", "n")

func norm(s string) string { return sinTilde.Replace(strings.ToLower(s)) }

func traer(u string) ([]byte, error) {
	req, _ := http.NewRequest("GET", u, nil)
	req.Header.Set("User-Agent", ua)
	req.Header.Set("Accept-Language", "es-CR,es;q=0.9")
	r, err := cli.Do(req)
	if err != nil { return nil, err }
	defer r.Body.Close()
	if r.StatusCode != 200 { return nil, fmt.Errorf("HTTP %d", r.StatusCode) }
	return io.ReadAll(io.LimitReader(r.Body, 8<<20))
}

type rss struct {
	Items []struct {
		Title       string `xml:"title"`
		Link        string `xml:"link"`
		Description string `xml:"description"`
		PubDate     string `xml:"pubDate"`
		Source      string `xml:"source"`
	} `xml:"channel>item"`
}

func fecha(s string) time.Time {
	for _, f := range []string{time.RFC1123Z, time.RFC1123, "Mon, 2 Jan 2006 15:04:05 -0700", "Mon, 2 Jan 2006 15:04:05 MST", time.RFC3339} {
		if t, err := time.Parse(f, strings.TrimSpace(s)); err == nil { return t }
	}
	return time.Now()
}

func recolectar() {
	nuevas := []Noticia{}
	for _, f := range fuentes {
		b, err := traer(f.URL)
		if err != nil { estadoF[f.Nombre] = "error: " + err.Error(); time.Sleep(2 * time.Second); continue }
		var x rss
		if err := xml.Unmarshal(b, &x); err != nil { estadoF[f.Nombre] = "error xml"; continue }
		for _, it := range x.Items {
			n := Noticia{Titulo: limpio(it.Title), Resumen: corta(limpio(it.Description), 400), Link: strings.TrimSpace(it.Link), Fuente: f.Nombre, Fecha: fecha(it.PubDate)}
			if strings.HasPrefix(f.Nombre, "Google") || strings.HasPrefix(f.URL, "https://news.google") {
				if it.Source != "" { n.Fuente = limpio(it.Source) }
				if i := strings.LastIndex(n.Titulo, " - "); i > 0 { n.Titulo = n.Titulo[:i] }
				n.Resumen = "" // el resumen de Google Noticias solo repite el título
			}
			if n.Titulo != "" && n.Link != "" { nuevas = append(nuevas, n) }
		}
		estadoF[f.Nombre] = fmt.Sprintf("ok %d", len(x.Items))
		time.Sleep(2 * time.Second)
	}
	nmu.Lock()
	vistos := map[string]bool{}
	todas := []Noticia{}
	corte := time.Now().Add(-7 * 24 * time.Hour)
	for _, n := range append(nuevas, noticias...) {
		k := norm(n.Titulo)
		if vistos[k] || vistos[n.Link] || n.Fecha.Before(corte) { continue }
		vistos[k], vistos[n.Link] = true, true
		todas = append(todas, n)
	}
	sort.Slice(todas, func(i, j int) bool { return todas[i].Fecha.After(todas[j].Fecha) })
	noticias, ultima = todas, time.Now()
	nmu.Unlock()
	guardar()
	log.Printf("buscador: %d noticias guardadas", len(todas))
}

func guardar() {
	nmu.RLock(); b, _ := json.Marshal(noticias); nmu.RUnlock()
	p := filepath.Join(bdir, "noticias.json")
	if os.WriteFile(p+".tmp", b, 0600) == nil { os.Rename(p+".tmp", p) }
}

func iniciarBuscador() {
	os.MkdirAll(bdir, 0700)
	if b, err := os.ReadFile(filepath.Join(bdir, "noticias.json")); err == nil { json.Unmarshal(b, &noticias) }
	go func() {
		time.Sleep(20 * time.Second) // deja arrancar Ollama primero
		for { recolectar(); time.Sleep(30 * time.Minute) }
	}()
}

var vacias = map[string]bool{"que": true, "paso": true, "hoy": true, "de": true, "la": true, "el": true, "en": true, "los": true, "las": true, "un": true, "una": true, "y": true, "a": true, "del": true, "al": true, "por": true, "para": true, "con": true, "se": true, "es": true, "lo": true, "como": true, "cual": true, "cuales": true, "hay": true, "sobre": true, "noticias": true, "noticia": true, "costa": true, "rica": true, "ultimas": true, "dia": true, "esta": true, "este": true, "me": true, "dime": true, "digame": true, "pasa": true, "pasando": true, "ayer": true, "mi": true}

func terminos(q string) []string {
	out := []string{}
	for _, w := range strings.FieldsFunc(norm(q), func(r rune) bool { return !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9') }) {
		if len(w) > 2 && !vacias[w] { out = append(out, w) }
	}
	return out
}

func buscarNoticias(q string, horas, n int) []Noticia {
	t := terminos(q)
	desde := time.Now().Add(-time.Duration(horas) * time.Hour)
	type par struct{ n Noticia; p int }
	ps := []par{}
	nmu.RLock()
	for _, x := range noticias {
		if x.Fecha.Before(desde) { continue }
		p := 0
		h := norm(x.Titulo + " " + x.Resumen)
		for _, w := range t { if strings.Contains(h, w) { p++ } }
		if len(t) > 0 && p == 0 { continue }
		ps = append(ps, par{x, p})
	}
	nmu.RUnlock()
	sort.SliceStable(ps, func(i, j int) bool { if ps[i].p != ps[j].p { return ps[i].p > ps[j].p }; return ps[i].n.Fecha.After(ps[j].n.Fecha) })
	out := []Noticia{}
	porFuente := map[string]int{}
	for _, x := range ps { // variedad: máx. 3 por medio
		if porFuente[x.n.Fuente] >= 3 && len(t) == 0 { continue }
		porFuente[x.n.Fuente]++
		out = append(out, x.n)
		if len(out) >= n { break }
	}
	return out
}

type Res struct{ Titulo, Link, Texto, Fuente string }

var (
	ddgMu   sync.Mutex
	ddgUlt  time.Time
	cacheMu sync.Mutex
	cache   = map[string]struct{ t time.Time; v any }{}
	reDDG   = regexp.MustCompile(`(?s)<a rel="nofollow" href="([^"]+)" class='result-link'>(.*?)</a>.*?<td class='result-snippet'>(.*?)</td>`)
)

func ddg(q string) ([]Res, error) {
	ddgMu.Lock()
	if d := 3*time.Second - time.Since(ddgUlt); d > 0 { time.Sleep(d) }
	ddgUlt = time.Now()
	ddgMu.Unlock()
	req, _ := http.NewRequest("POST", "https://lite.duckduckgo.com/lite/", strings.NewReader(url.Values{"q": {q}, "kl": {"cr-es"}}.Encode()))
	req.Header.Set("User-Agent", ua)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	r, err := cli.Do(req)
	if err != nil { return nil, err }
	defer r.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(r.Body, 4<<20))
	out := []Res{}
	for _, m := range reDDG.FindAllStringSubmatch(string(b), 8) {
		u := html.UnescapeString(m[1])
		if strings.Contains(u, "duckduckgo.com/y.js") { continue } // anuncios
		h := u
		if pu, err := url.Parse(u); err == nil { h = strings.TrimPrefix(pu.Host, "www.") }
		out = append(out, Res{limpio(m[2]), u, corta(limpio(m[3]), 350), h})
	}
	if len(out) == 0 && r.StatusCode != 200 { return nil, fmt.Errorf("HTTP %d", r.StatusCode) }
	return out, nil
}

func wiki(q string) []Res {
	b, err := traer("https://es.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=3&prop=extracts|info&inprop=url&exintro=1&explaintext=1&exsentences=4&gsrsearch=" + url.QueryEscape(q))
	if err != nil { return nil }
	var x struct{ Query struct{ Pages map[string]struct{ Index int; Title, Extract, Fullurl string } } }
	json.Unmarshal(b, &x)
	out := []Res{}
	for _, p := range x.Query.Pages { out = append(out, Res{p.Title, p.Fullurl, corta(p.Extract, 600), "Wikipedia"}) }
	sort.Slice(out, func(i, j int) bool { return out[i].Titulo < out[j].Titulo })
	return out
}

var reCambio = regexp.MustCompile(`dolar|tipo de cambio|divisa|colones? por`)

func cambio() *Res {
	b, err := traer("https://api.hacienda.go.cr/indicadores/tc/dolar")
	if err != nil { return nil }
	var x struct{ Venta, Compra struct{ Fecha string; Valor float64 } }
	if json.Unmarshal(b, &x) != nil || x.Venta.Valor == 0 { return nil }
	return &Res{"Tipo de cambio del dólar (BCCR, vía Ministerio de Hacienda)", "https://www.bccr.fi.cr/",
		fmt.Sprintf("Fecha %s: compra ₡%.2f, venta ₡%.2f (referencia del Banco Central de Costa Rica).", x.Venta.Fecha, x.Compra.Valor, x.Venta.Valor), "api.hacienda.go.cr"}
}

func enCache(k string, f func() any) any {
	cacheMu.Lock()
	if c, ok := cache[k]; ok && time.Since(c.t) < 15*time.Minute { cacheMu.Unlock(); return c.v }
	cacheMu.Unlock()
	v := f()
	cacheMu.Lock(); cache[k] = struct{ t time.Time; v any }{time.Now(), v}
	if len(cache) > 300 { cache = map[string]struct{ t time.Time; v any }{} }
	cacheMu.Unlock()
	return v
}

func responderJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(v)
}

// devuelve true si atendió la ruta
func rutasBuscador(w http.ResponseWriter, r *http.Request) bool {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len([]rune(q)) > 200 { q = string([]rune(q)[:200]) }
	switch r.URL.Path {
	case "/noticias":
		horas, _ := strconv.Atoi(r.URL.Query().Get("horas"))
		if horas <= 0 || horas > 168 { horas = 24 }
		n, _ := strconv.Atoi(r.URL.Query().Get("n"))
		if n <= 0 || n > 60 { n = 25 }
		nmu.RLock(); u := ultima; total := len(noticias); nmu.RUnlock()
		responderJSON(w, map[string]any{"q": q, "actualizado": u, "total": total, "noticias": buscarNoticias(q, horas, n)})
	case "/buscar":
		if q == "" { http.Error(w, "falta q", 400); return true }
		t0 := time.Now()
		nq := norm(q)
		var wg sync.WaitGroup
		var web, wk []Res
		var cam *Res
		var errWeb string
		wg.Add(2)
		go func() { defer wg.Done(); v := enCache("d:"+nq, func() any { x, err := ddg(q); if err != nil { return err.Error() }; return x }); if s, ok := v.(string); ok { errWeb = s } else { web = v.([]Res) } }()
		go func() { defer wg.Done(); wk = enCache("w:"+nq, func() any { return wiki(q) }).([]Res) }()
		if reCambio.MatchString(nq) { wg.Add(1); go func() { defer wg.Done(); cam = cambio() }() }
		wg.Wait()
		horas := 72
		if strings.Contains(nq, "hoy") { horas = 30 }
		responderJSON(w, map[string]any{"q": q, "noticias": buscarNoticias(q, horas, 8), "web": web, "errorWeb": errWeb, "wikipedia": wk, "cambio": cam, "ms": time.Since(t0).Milliseconds()})
	case "/responder":
		responder(w, r)
	case "/buscador/estado":
		nmu.RLock(); u := ultima; total := len(noticias); nmu.RUnlock()
		responderJSON(w, map[string]any{"actualizado": u, "total": total, "fuentes": estadoF})
	default:
		return false
	}
	return true
}
