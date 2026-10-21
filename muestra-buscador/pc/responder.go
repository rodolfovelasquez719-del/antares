// /responder?q= : busca (noticias locales, tipo de cambio, DuckDuckGo, Wikipedia), arma las fuentes numeradas
// y le pide a qwen2.5:3b (Ollama local) un resumen en español, de usted, citando [n] y sin inventar.
// Respuesta NDJSON en vivo: {"tipo":"fuentes",...} → {"tipo":"texto","t":"…"}… → {"tipo":"fin",...}.
// Temas de manejo, seguridad o salud: NO se resume (solo fuentes; la página ofrece Gemini).
package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"
)

var reRiesgo = regexp.MustCompile(`\b(manej|conduc|carretera|autopista|lluvi|aguacero|neblina|luces|faro|vehicul|carro|camion|moto|llanta|freno|aceite|motor|bateria|gasolina|velocidad|accidente|choque|segur|peligr|riesgo|salud|medic|pastilla|dosis|dolor|sintoma|enferm|fiebre|presion arterial|diabet|emergenc|hospital|herida|sangr|quemadura|intoxic|veneno|alergi|embaraz|electric|voltaje|enchufe|cable|breaker|fuga de gas|incendio|extintor|nino|nina|bebe|sismo|temblor|terremoto|inundac)`)
var reActual = regexp.MustCompile(`\b(hoy|noticia|que paso|que esta pasando|ultima hora|esta semana|ayer)`)

const sistemaBuscador = "Usted es Antares, el asistente de don Freddy en Costa Rica. Responda en español de Costa Rica, tratándolo SIEMPRE de usted " +
	"(nunca tú ni vos). Use ÚNICAMENTE la información de las FUENTES numeradas que se le dan; no agregue datos, cifras, nombres ni fechas que no estén ahí. " +
	"Después de cada dato ponga la cita entre corchetes, por ejemplo [1] o [2][4]. Si las fuentes no responden la pregunta, dígalo con honestidad. " +
	"Sea breve: de 3 a 6 frases (o hasta 6 viñetas con «- » si son varias noticias). Texto plano, sin markdown ni negritas. No dé consejos de manejo, seguridad ni salud."

type Fuente struct {
	N      int    `json:"n"`
	Titulo string `json:"titulo"`
	Link   string `json:"link"`
	Fuente string `json:"fuente"`
	Fecha  string `json:"fecha,omitempty"`
	Texto  string `json:"texto"`
}

func juntarFuentes(q string) []Fuente {
	nq := norm(q)
	out := []Fuente{}
	add := func(t, l, f, fe, tx string) {
		for _, x := range out { if x.Link == l { return } }
		if len(out) < 8 { out = append(out, Fuente{len(out) + 1, t, l, f, fe, tx}) }
	}
	addN := func(ns []Noticia, max int) {
		for i, n := range ns {
			if i >= max { break }
			tx := n.Resumen
			if tx == "" { tx = n.Titulo }
			add(n.Titulo, n.Link, n.Fuente, n.Fecha.In(time.FixedZone("CR", -6*3600)).Format("02/01 3:04 p. m."), corta(tx, 160))
		}
	}
	if reCambio.MatchString(nq) {
		if c := cambio(); c != nil { add(c.Titulo, c.Link, c.Fuente, "", c.Texto) }
	}
	actual := reActual.MatchString(nq)
	horas := 72
	if actual { horas = 30 }
	ns := buscarNoticias(q, horas, 8)
	if actual && !reCambio.MatchString(nq) { addN(ns, 7) } else { addN(ns, 2) }
	if len(out) < 8 && !(actual && len(out) >= 6) {
		if v, ok := enCache("d:"+nq, func() any { x, err := ddg(q); if err != nil { return err.Error() }; return x }).([]Res); ok {
			for _, r := range v { if len(out) >= 6 { break }; add(r.Titulo, r.Link, r.Fuente, "", corta(r.Texto, 200)) }
		}
	}
	if len(out) < 8 && !actual {
		k := 0
		for _, r := range enCache("w:"+nq, func() any { return wiki(q) }).([]Res) {
			if k >= 2 { break }
			rel := false // solo artículos cuyo título comparte una palabra clave
			for _, w := range terminos(q) { if strings.Contains(norm(r.Titulo), w) { rel = true; break } }
			if rel { k++; add(r.Titulo, r.Link, "Wikipedia", "", corta(r.Texto, 300)) }
		}
	}
	return out
}

func responder(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" { http.Error(w, "falta q", 400); return }
	if len([]rune(q)) > 200 { q = string([]rune(q)[:200]) }
	t0 := time.Now()
	w.Header().Set("Content-Type", "application/x-ndjson; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	fl, _ := w.(http.Flusher)
	enc := json.NewEncoder(w)
	send := func(v any) { enc.Encode(v); if fl != nil { fl.Flush() } }
	fs := juntarFuentes(q)
	riesgo := reRiesgo.MatchString(norm(q))
	send(map[string]any{"tipo": "fuentes", "fuentes": fs, "ms": time.Since(t0).Milliseconds(), "delicado": riesgo})
	if riesgo || len(fs) == 0 {
		send(map[string]any{"tipo": "fin", "ms": time.Since(t0).Milliseconds(), "sinResumen": true}); return
	}
	var ctx strings.Builder
	ctx.WriteString("Fecha de hoy: " + time.Now().In(time.FixedZone("CR", -6*3600)).Format("02/01/2006 3:04 p. m.") + " (Costa Rica).\nFUENTES:\n")
	for _, f := range fs { fmt.Fprintf(&ctx, "[%d] %s (%s%s): %s\n", f.N, f.Titulo, f.Fuente, map[bool]string{true: ", " + f.Fecha, false: ""}[f.Fecha != ""], f.Texto) }
	ctx.WriteString("\nPREGUNTA DE DON FREDDY: " + q)
	body, _ := json.Marshal(map[string]any{"model": "qwen2.5:3b", "stream": true, "keep_alive": "30m",
		"messages": []map[string]string{{"role": "system", "content": sistemaBuscador}, {"role": "user", "content": ctx.String()}},
		"options": map[string]any{"temperature": 0.2, "num_predict": 350, "num_ctx": 2048}})
	resp, err := http.Post(upstream+"/api/chat", "application/json", bytes.NewReader(body))
	if err != nil { send(map[string]any{"tipo": "error", "error": "cerebro PC: " + err.Error()}); return }
	defer resp.Body.Close()
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 64<<10), 1<<20)
	var primera int64
	for sc.Scan() {
		var j struct{ Message struct{ Content string }; Error string; Done bool }
		if json.Unmarshal(sc.Bytes(), &j) != nil { continue }
		if j.Error != "" { send(map[string]any{"tipo": "error", "error": j.Error}); return }
		if j.Message.Content != "" {
			if primera == 0 { primera = time.Since(t0).Milliseconds() }
			send(map[string]any{"tipo": "texto", "t": j.Message.Content})
		}
	}
	send(map[string]any{"tipo": "fin", "ms": time.Since(t0).Milliseconds(), "primeraMs": primera})
}
