"use strict";
// Mapa moderno de cerca (MapLibre + OpenFreeMap, sin claves), búsqueda (Nominatim/OSM) y Mi ubicación (solo en este equipo).
window.Mapa=(function(){
  let M=null,cargando=null,activo=false,yoMk=null,busMk=null,watch=null;
  const ESTILO="https://tiles.openfreemap.org/styles/dark";
  const A2Z=a=>6.8+Math.log2(.22/a), Z2A=z=>.22*2**(6.8-z);
  function lib(){
    if(window.maplibregl)return Promise.resolve();
    return cargando||(cargando=new Promise((ok,no)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js";s.onload=ok;s.onerror=()=>{cargando=null;no(Error("maplibre"))};document.head.appendChild(s)}));
  }
  function tinte(){
    for(const l of M.getStyle().layers){
      const id=l.id;
      try{
        if(l.type==="background")M.setPaintProperty(id,"background-color","#010a06");
        else if(id==="water")M.setPaintProperty(id,"fill-color","#03261b");
        else if(l.type==="fill"&&/landuse|landcover|park/.test(id))M.setPaintProperty(id,"fill-color","#03140d");
        else if(id==="building")M.setLayoutProperty(id,"visibility","none");
        else if(l.type==="line"&&/motorway/.test(id))M.setPaintProperty(id,"line-color","rgba(255,59,92,.55)");
        else if(l.type==="line"&&/highway|road/.test(id))M.setPaintProperty(id,"line-color","rgba(34,255,154,.32)");
        else if(l.type==="line"&&/boundary/.test(id))M.setPaintProperty(id,"line-color","rgba(34,255,154,.6)");
        else if(l.type==="symbol"){M.setPaintProperty(id,"text-color","#9fe8c5");M.setPaintProperty(id,"text-halo-color","#00120a")}
      }catch{}
    }
  }
  const fc=f=>({type:"FeatureCollection",features:f});
  const pt=(o,i,k)=>({type:"Feature",properties:{k,i,m:o.mag||0,n:o.name||o.cs||"",t:o.t!=null?o.t+"°":""},geometry:{type:"Point",coordinates:[o.lng,o.lat]}});
  function circulo(lat,lng,m){const c=[];for(let a=0;a<=64;a++){const t=a/64*2*Math.PI;c.push([lng+m/111320/Math.cos(lat*Math.PI/180)*Math.cos(t),lat+m/110540*Math.sin(t)])}return{type:"Feature",geometry:{type:"Polygon",coordinates:[c]}}}
  function capas(){
    M.addSource("esri",{type:"raster",tiles:["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],tileSize:256,maxzoom:19,attribution:"Imágenes © Esri, Maxar, Earthstar Geographics"});
    M.addLayer({id:"esri",type:"raster",source:"esri",layout:{visibility:"none"},paint:{"raster-saturation":-.35,"raster-brightness-max":.8}},"waterway");
    if(window.RV){M.addSource("radar",{type:"raster",tiles:[RV+"/256/{z}/{x}/{y}/2/1_1.png"],tileSize:256,maxzoom:7,attribution:"Radar © RainViewer"});M.addLayer({id:"radar",type:"raster",source:"radar",layout:{visibility:"none"},paint:{"raster-opacity":.7}},"waterway")}
    M.addLayer({id:"edif3d",type:"fill-extrusion",source:"openmaptiles","source-layer":"building",minzoom:13,paint:{"fill-extrusion-color":["interpolate",["linear"],["coalesce",["get","render_height"],8],0,"#0b3a28",40,"#14805a",120,"#22ff9a"],"fill-extrusion-height":["coalesce",["get","render_height"],8],"fill-extrusion-base":["coalesce",["get","render_min_height"],0],"fill-extrusion-opacity":.78}});
    for(const s of ["rut","sis","cli","avi","acc"])M.addSource(s,{type:"geojson",data:fc([])});
    M.addLayer({id:"acc",type:"fill",source:"acc",paint:{"fill-color":"rgba(58,214,255,.14)","fill-outline-color":"#3ad6ff"}});
    M.addLayer({id:"rut-glow",type:"line",source:"rut",layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":["get","c"],"line-width":10,"line-blur":7,"line-opacity":.55}});
    M.addLayer({id:"rut",type:"line",source:"rut",layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":["get","c"],"line-width":3}});
    M.addLayer({id:"sis",type:"circle",source:"sis",paint:{"circle-color":"#ff3b5c","circle-opacity":.55,"circle-stroke-color":"#ff3b5c","circle-stroke-width":1.5,"circle-radius":["interpolate",["linear"],["get","m"],2.5,5,7,26]}});
    M.addLayer({id:"avi",type:"circle",source:"avi",paint:{"circle-color":"#ffc857","circle-radius":5,"circle-stroke-color":"#000","circle-stroke-width":1}});
    M.addLayer({id:"cli",type:"circle",source:"cli",paint:{"circle-color":"#22ff9a","circle-radius":5,"circle-blur":.2}});
    M.addLayer({id:"cli-t",type:"symbol",source:"cli",layout:{"text-field":["concat",["get","n"]," ",["get","t"]],"text-size":12,"text-offset":[0,1.2],"text-font":["Noto Sans Bold"]},paint:{"text-color":"#22ff9a","text-halo-color":"#000","text-halo-width":1.5}});
    for(const id of ["sis","avi","cli","rut"]){
      M.on("click",id,e=>{const p=e.features[0].properties;if(p.k==="rut"){const r=D.rut[p.i];return card(r.info[0],r.info[1],r.info[2])}clickObj((p.k==="avi"?D.avi:p.k==="sis"?D.sis:D.cli)[p.i])});
      M.on("mouseenter",id,()=>M.getCanvas().style.cursor="pointer");M.on("mouseleave",id,()=>M.getCanvas().style.cursor="");
    }
  }
  function sync(){
    if(!M||!M.getSource("sis"))return;
    M.getSource("sis").setData(fc(on.sis?D.sis.map((o,i)=>pt(o,i,"sis")):[]));
    M.getSource("cli").setData(fc(on.cli?D.cli.map((o,i)=>pt(o,i,"cli")):[]));
    M.getSource("avi").setData(fc(on.avi?D.avi.map((o,i)=>pt(o,i,"avi")):[]));
    M.getSource("rut").setData(fc(on.rut?D.rut.map((r,i)=>({type:"Feature",properties:{k:"rut",i,c:r.c},geometry:{type:"LineString",coordinates:r.pts.map(p=>[p[1],p[0]])}})):[]));
    M.setLayoutProperty("esri","visibility",on.sate?"visible":"none");
    M.setLayoutProperty("edif3d","visibility",on.b3d&&!on.sate?"visible":"none");
    if(M.getLayer("radar"))M.setLayoutProperty("radar","visibility",on.rad?"visible":"none");
    else if(on.rad&&window.RV){try{capasRadar()}catch{}}
  }
  function capasRadar(){M.addSource("radar",{type:"raster",tiles:[RV+"/256/{z}/{x}/{y}/2/1_1.png"],tileSize:256,maxzoom:7,attribution:"Radar © RainViewer"});M.addLayer({id:"radar",type:"raster",source:"radar",paint:{"raster-opacity":.7}},"waterway")}
  async function abrir(lat,lng,zoom){
    try{await lib()}catch{aviso("Mapa detallado: fuente no disponible. Se queda en el globo.");return false}
    if(!M){
      M=new maplibregl.Map({container:"map",style:ESTILO,center:[lng,lat],zoom,pitch:zoom>=13?55:35,bearing:-12,maxPitch:70,attributionControl:{compact:true},fadeDuration:0,pixelRatio:Math.min(devicePixelRatio,lowEnd?1.5:2)});
      M.on("error",e=>console.log("mapa:",e.error&&e.error.message));
      await new Promise(r=>M.once("load",r));
      tinte();capas();sync();
      M.on("zoomend",()=>{if(activo&&M.getZoom()<6.3)salir(true)});
    }else{M.jumpTo({center:[lng,lat],zoom:Math.max(7,zoom-1.2)});M.resize()}
    activo=true;document.body.classList.add("mapa");G.pauseAnimation();
    setTimeout(()=>M.resize(),50);
    return true;
  }
  function salir(desdeMapa){
    if(!activo)return;activo=false;document.body.classList.remove("mapa");G.resumeAnimation();
    if(desdeMapa&&M){const c=M.getCenter();G.pointOfView({lat:c.lat,lng:c.lng,altitude:.13},0);G.pointOfView({lat:c.lat,lng:c.lng,altitude:.3},900)}
  }
  async function fly(lat,lng,zoom){
    if(!activo){const ok=await abrir(lat,lng,zoom);if(!ok){G.pointOfView({lat,lng,altitude:Z2A(Math.min(zoom,9))},1800);return}}
    M.flyTo({center:[lng,lat],zoom,pitch:zoom>=13&&on.b3d?55:30,speed:1.4,essential:true});
  }
  // globo -> mapa al acercarse
  let t=null;
  G.onZoom(p=>{if(activo)return;clearTimeout(t);t=setTimeout(()=>{if(!activo&&p.altitude<.1)abrir(p.lat,p.lng,A2Z(p.altitude))},250)});
  // ---------- aviso ----------
  let at=null;function aviso(m){const a=$("#aviso");a.textContent=m;a.classList.add("on");clearTimeout(at);at=setTimeout(()=>a.classList.remove("on"),7000)}
  $("#aviso").onclick=()=>$("#aviso").classList.remove("on");
  // ---------- Mi ubicación (nunca se envía ni se guarda fuera del equipo) ----------
  function ponerYo(c){
    D.yo={k:"yo",lat:c.latitude,lng:c.longitude,acc:c.accuracy};render();
    if(M&&M.getSource("acc"))M.getSource("acc").setData(fc([circulo(c.latitude,c.longitude,Math.max(10,c.accuracy))]));
    if(M){if(!yoMk){const e=document.createElement("div");e.className="yo";e.style.transform="none";yoMk=new maplibregl.Marker({element:e})}yoMk.setLngLat([c.longitude,c.latitude]).addTo(M)}
  }
  $("#yo").onclick=()=>{
    if(!("geolocation" in navigator)){aviso("Este navegador no ofrece ubicación.");return}
    $("#yo").textContent="◉ BUSCANDO…";
    let primera=true;
    if(watch!=null)navigator.geolocation.clearWatch(watch);
    watch=navigator.geolocation.watchPosition(async p=>{
      $("#yo").textContent="◉ MI UBICACIÓN";
      if(primera){primera=false;await fly(p.coords.latitude,p.coords.longitude,p.coords.accuracy>2000?11:15.5);}
      ponerYo(p.coords);
      if(primera===false&&M&&M.getSource("acc"))ponerYo(p.coords);
      log("SU POSICIÓN: ±"+Math.round(p.coords.accuracy)+" M (SOLO EN ESTE EQUIPO)");
    },e=>{
      $("#yo").textContent="◉ MI UBICACIÓN";navigator.geolocation.clearWatch(watch);watch=null;
      if(e.code===1)aviso("Permiso de ubicación negado. En iPhone: Ajustes › Privacidad y seguridad › Localización › Safari (y Sitios web de Safari) › «Al usar la app», y luego toque de nuevo «Mi ubicación».");
      else if(e.code===3)aviso("La ubicación tardó demasiado. Intente de nuevo cerca de una ventana o con GPS activo.");
      else aviso("No se pudo obtener su ubicación en este momento.");
    },{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
  };
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&watch!=null){navigator.geolocation.clearWatch(watch);watch=null}});
  // ---------- Búsqueda (Nominatim/OSM: máx. 1 consulta/seg, con espera, Costa Rica primero) ----------
  const cache=new Map();let qt=null,ultima=0;
  async function geocode(q){
    if(cache.has(q))return cache.get(q);
    const espera=Math.max(0,1100-(Date.now()-ultima));if(espera)await new Promise(r=>setTimeout(r,espera));
    const base="https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=es&q="+encodeURIComponent(q);
    ultima=Date.now();let r=await (await fetch(base+"&countrycodes=cr",{referrerPolicy:"strict-origin-when-cross-origin"})).json();
    if(!r.length){await new Promise(s=>setTimeout(s,1100));ultima=Date.now();r=await (await fetch(base,{referrerPolicy:"strict-origin-when-cross-origin"})).json()}
    cache.set(q,r);return r;
  }
  const res=$("#res");
  async function buscar(enter){
    const q=$("#q").value.trim();if(q.length<3){res.classList.remove("on");return}
    res.innerHTML='<button disabled>Buscando…</button>';res.classList.add("on");
    try{
      const r=await geocode(q);if(q!==$("#q").value.trim())return;
      if(!r.length){res.innerHTML='<button disabled>Sin resultados</button>';return}
      res.innerHTML=r.map((x,i)=>`<button data-i="${i}">${esc(x.name||x.display_name.split(",")[0])}<br><small>${esc(x.display_name)}</small></button>`).join("")+'<button disabled><small>Datos © OpenStreetMap · Nominatim</small></button>';
      res.querySelectorAll("[data-i]").forEach(b=>b.onclick=()=>ir(r[+b.dataset.i]));
      if(enter)ir(r[0]);
    }catch{res.innerHTML='<button disabled>Búsqueda: fuente no disponible</button>'}
  }
  async function ir(x){
    res.classList.remove("on");$("#q").blur();
    const lat=+x.lat,lng=+x.lon,z=/country/.test(x.addresstype||x.type)?6.5:/state|province/.test(x.addresstype)?9:/city|town|county/.test(x.addresstype)?13:16;
    D.busq={k:"busq",lat,lng,name:x.display_name};render();
    if(z<7){salir();G.pointOfView({lat,lng,altitude:Z2A(z)},2000);return}
    await fly(lat,lng,z);
    if(M){if(!busMk){const e=document.createElement("div");e.className="pin";e.style.transform="rotate(-45deg)";busMk=new maplibregl.Marker({element:e,anchor:"bottom"})}busMk.setLngLat([lng,lat]).addTo(M)}
    card("⌖ "+(x.name||"RESULTADO"),[["Dirección",esc(x.display_name)],["Lat, Lng",lat.toFixed(5)+", "+lng.toFixed(5)],["Fuente","OpenStreetMap (Nominatim)"]]);
  }
  $("#q").addEventListener("input",()=>{clearTimeout(qt);qt=setTimeout(()=>buscar(false),900)});
  $("#q").addEventListener("keydown",e=>{if(e.key==="Enter"){clearTimeout(qt);buscar(true)}});
  document.addEventListener("click",e=>{if(!e.target.closest(".res,.bus"))res.classList.remove("on")});
  const q0=new URLSearchParams(location.search).get("q");if(q0){$("#q").value=q0;setTimeout(()=>buscar(true),2500)}
  return{sync,fly,salir:()=>salir(false),activo:()=>activo};
})();
