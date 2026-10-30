// Viernes - Precios e ideas (datos fijos de tiendas CR, octubre 2026; aproximados).
const $ = (id) => document.getElementById(id);
const fmt = (n) => "₡" + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const RANGES = [
  ["Pulsera sencilla de hilo o cuentas", "₡1.500 – ₡4.000", "Mercadito Central, KakaoMarket, Fantasy Dreams"],
  ["Pulsera de cuentas / piedras / cristales", "₡4.000 – ₡7.000", "Mercadito Central, Fantasy Dreams, Agapanto"],
  ["Pulsera de autor (piedras naturales, diseño único)", "₡7.000 – ₡18.000", "Jaspe Accesorios, Eva Alambrismo"],
  ["Pulsera personalizada con nombre", "₡3.000 – ₡12.000", "Pulseras Nina's, Subli Oso, SO.B Trendy, Etéreo"],
  ["Personalizada grabada en acero (premium)", "₡8.000 – ₡24.500", "Piedra Rosa CR"],
  ["Collar de hilo con dije o piedra", "₡3.500 – ₡5.500", "Mercadito Central, Fantasy Dreams"],
  ["Collar de cuentas / artesanal", "₡6.500 – ₡13.500", "Fantasy Dreams, Agapanto, Jaspe"],
  ["Set collar + aretes (+ pulsera)", "₡5.000 – ₡12.000", "MP Bisutería, Contour, Artesanías Remoc, Hecho por Mujeres"],
  ["Pareja / dúo de pulseras (2 piezas)", "₡5.000 – ₡5.500", "Fantasy Dreams (Pinky Promise, Gym Partners)"],
  ["Niñas: pulseras temáticas (princesas, sirenita)", "₡3.500 – ₡5.500", "Fantasy Dreams, Lovely Kids"],
];
export const IDEAS = [
  ["🍬 Collar o pulsera estilo chicle", "Cuentas grandes pastel: rosa, lila, menta, celeste y amarillo pollito."],
  ["🎄 Navidad (nov–dic)", "Rojo + dorado + blanco perla; dijes de estrella o copo; sets de regalo con cajita. ¡Ya es temporada!"],
  ["🧧 Intercambios y amigo secreto", "Pulseras de ₡2.500–₡4.000 en paquetes de 3 o 5 para la oficina o el cole."],
  ["💐 Día de la Madre (15 de agosto)", "Pulsera «Mamá» con inicial de los hijos, perlas + rosa palo; set mamá e hija."],
  ["🎒 Regreso a clases (enero–febrero)", "Pulseras de amistad, colores del uniforme, llaveros con nombre para el bulto."],
  ["💕 San Valentín (14 de febrero)", "Pulseras dúo de pareja o mejores amigas; rojo, rosa y blanco con corazones."],
  ["✨ Personalizadas con nombre", "Letras de colores para niñas; letras doradas sobre perla para mamás. Se cobran más."],
  ["🌊 Verano tico", "Conchitas, turquesa, coral y arena; tobilleras para la playa."],
  ["🇨🇷 Patrias (15 de septiembre)", "Azul, blanco y rojo; pulseras sencillas para desfiles y actos del cole."],
  ["🎨 Combinaciones de moda", "Lila + verde menta · rosa + dorado · perla + celeste · beige + café (tonos tierra) · arcoíris pastel."],
];
export function initPrecios(onAsk) {
  $("pc-ranges").innerHTML = '<div class="card" style="padding:0">' + RANGES.map(([t, r, s]) => `<div class="rg"><div>${t}<small>Visto en: ${s}</small></div><b>${r}</b></div>`).join("") + "</div>";
  $("pc-ideas").innerHTML = IDEAS.map(([t, d]) => `<div class="idea"><b>${t}</b><span>${d}</span></div>`).join("");
  const calc = () => {
    const mat = +$("pc-mat").value || 0, min = +$("pc-min").value || 0, emp = +$("pc-emp").value || 0, hora = +$("pc-hora").value || 0, mar = +$("pc-mar").value;
    const costo = mat + emp + (min / 60) * hora, precio = Math.max(500, Math.ceil(costo * (1 + mar / 100) / 500) * 500);
    $("pc-out").textContent = fmt(precio);
    $("pc-det").textContent = `Costo ${fmt(costo)} · te quedan ${fmt(precio - mat - emp)} por tu trabajo y ganancia`;
  };
  ["pc-mat", "pc-min", "pc-emp", "pc-hora", "pc-mar"].forEach((i) => $(i).addEventListener("input", calc)); calc();
  $("pc-ask").onclick = onAsk;
}
