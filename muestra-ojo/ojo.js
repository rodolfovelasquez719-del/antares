"use strict";
// ---------- capas de datos públicos (muestra) ----------
const NO="fuente no disponible";
const log=t=>{ticker.push(t);paintStat()};
const BB={lamin:5,lomin:-93,lamax:18.5,lomax:-76}; // Centroamérica

// 1) Aviones: OpenSky anónimo -> adsb.lol (respaldo)
async function aviones(){
  try{
    const d=await getJ(`https://opensky-network.org/api/states/all?lamin=${BB.lamin}&lomin=${BB.lomin}&lamax=${BB.lamax}&lomax=${BB.lomax}`,10000);
    D.avi=(d.states||[]).filter(s=>s[5]!=null&&s[6]!=null&&!s[8]).map(s=>({k:"avi",cs:(s[1]||"").trim(),pais:s[2],lng:s[5],lat:s[6],altm:s[7]??s[13],v:s[9]!=null?s[9]*3.6:null,hdg:s[10],src:"OpenSky Network",alt:Math.min(.06,.004+(s[7]||0)/12000*.05)}));
  }catch(e){
    try{
      let d;try{d=await getJ("https://api.adsb.lol/v2/lat/11/lon/-85/dist/250",8000)}catch{d=await getJ("https://opendata.adsb.fi/api/v2/lat/11/lon/-85/dist/250",8000)}
      D.avi=(d.ac||d.aircraft||[]).filter(a=>a.lat!=null&&a.alt_baro!=="ground").map(a=>({k:"avi",cs:(a.flight||a.r||"").trim(),pais:a.r?"Matrícula "+a.r:"—",lng:a.lon,lat:a.lat,altm:typeof a.alt_baro==="number"?a.alt_baro*.3048:null,v:a.gs!=null?a.gs*1.852:null,hdg:a.track,src:"ADS-B abierto (adsb.lol / adsb.fi)",alt:Math.min(.06,.004+((a.alt_baro||0)*.3048)/12000*.05)}));
    }catch(e2){st.avi=NO;D.avi=[];paintStat();render();return}
  }
  st.avi=D.avi.length+" en vuelo";log(D.avi.length+" AERONAVES SOBRE CENTROAMÉRICA");render();
}
// 2) Sismos: USGS semana
async function sismos(){
  try{
    const d=await getJ("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson");
    D.sis=d.features.map(f=>({k:"sis",lng:f.geometry.coordinates[0],lat:f.geometry.coordinates[1],depth:f.geometry.coordinates[2]||0,mag:f.properties.mag||0,place:f.properties.place,time:f.properties.time}));
    const cr=D.sis.filter(s=>s.lat>7&&s.lat<12&&s.lng>-87&&s.lng<-82.5);
    st.sis=D.sis.length+" (7 días, M2.5+)";log(`SISMOS 7D: ${D.sis.length} · CERCA DE CR: ${cr.length}`);
    const big=D.sis.reduce((a,b)=>b.mag>a.mag?b:a,{mag:0});if(big.mag)log(`MAYOR: M${big.mag.toFixed(1)} ${String(big.place).toUpperCase()}`);
  }catch(e){st.sis=NO;D.sis=[]}
  paintStat();render();
}
// 3) Satélites + ISS: CelesTrak + satellite.js
let SATS=[],ISS=null;
async function satelites(){
  try{
    const [vis,st2]=await Promise.all([getJ("https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle"),getJ("https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle").catch(()=>"")]);
    const parse=t=>{const l=t.split(/\r?\n/).map(s=>s.trimEnd()).filter(Boolean),o=[];for(let i=0;i+2<l.length+0&&i+2<=l.length-1;i+=3)try{o.push({name:l[i].trim(),rec:satellite.twoline2satrec(l[i+1],l[i+2])})}catch{}return o};
    SATS=parse(vis).filter(s=>!/ISS \(ZARYA\)/.test(s.name)).slice(0,lowEnd?120:180);
    ISS=(parse(st2)[0])||null;
    if(!SATS.length)throw 0;
    st.sat=SATS.length+" + ISS";log(SATS.length+" SATÉLITES VISIBLES EN SEGUIMIENTO");
    tickSat();setInterval(()=>{if(!document.hidden&&on.sat)tickSat()},lowEnd?4000:2000);
    if(ISS){issOrbit();setInterval(issOrbit,60000)}
  }catch(e){st.sat=NO;paintStat();render()}
}
function pos(rec,date){const pv=satellite.propagate(rec,date);if(!pv||!pv.position)return null;const g=satellite.eciToGeodetic(pv.position,satellite.gstime(date));return{lat:satellite.degreesLat(g.latitude),lng:satellite.degreesLong(g.longitude),km:g.height}}
const R=6371;
function tickSat(){
  const now=new Date();
  D.sat=SATS.map(s=>{const p=pos(s.rec,now);return p&&isFinite(p.lat)?{k:"sat",name:s.name,...p,alt:p.km/R}:null}).filter(Boolean);
  if(ISS){const p=pos(ISS.rec,now);if(p){D.issPt={k:"iss",name:"ISS (ESTACIÓN ESPACIAL)",...p,alt:p.km/R};}}
  render();
}
function issOrbit(){
  const t0=Date.now(),pts=[];
  for(let m=-10;m<=92;m+=1.5){const p=pos(ISS.rec,new Date(t0+m*60000));if(p)pts.push([p.lat,p.lng,p.km/R])}
  D.iss={pts,c:"rgba(255,59,92,.85)",w:1.5,dash:.08,info:["★ ÓRBITA ISS",[["Periodo","~92 min"],["Fuente","CelesTrak + satellite.js"]]]};
  log("ISS: ÓRBITA PROYECTADA 90 MIN");render();
}
// 4) Clima: Open-Meteo (una sola llamada multi-ciudad)
const CIUD=[["Alajuela",10.016,-84.214],["San José",9.933,-84.08],["Heredia",9.998,-84.117],["Cartago",9.864,-83.919],["Liberia",10.635,-85.437],["Puntarenas",9.976,-84.833],["Limón",9.99,-83.036],["P. Zeledón",9.373,-83.703]];
async function clima(){
  try{
    const u="https://api.open-meteo.com/v1/forecast?latitude="+CIUD.map(c=>c[1]).join(",")+"&longitude="+CIUD.map(c=>c[2]).join(",")+"&current=temperature_2m,precipitation,wind_speed_10m&hourly=precipitation_probability&forecast_hours=1&timezone=America%2FCosta_Rica";
    let d=await getJ(u);if(!Array.isArray(d))d=[d];
    D.cli=d.map((r,i)=>({k:"cli",name:CIUD[i][0],lat:CIUD[i][1],lng:CIUD[i][2],t:Math.round(r.current.temperature_2m),p:r.current.precipitation,w:Math.round(r.current.wind_speed_10m),pp:r.hourly?.precipitation_probability?.[0]??"—"}));
    st.cli=D.cli.length+" ciudades";const a=D.cli[0];log(`ALAJUELA ${a.t}°C · LLUVIA ${a.p} MM · PROB ${a.pp}%`);
  }catch(e){st.cli=NO;D.cli=[]}
  paintStat();render();
}
// 4b) Radar: RainViewer (mosaicos zoom 6 sobre Centroamérica, como capa en el globo)
let radarTiles=null;
function t2lat(y,z){const n=Math.PI-2*Math.PI*y/2**z;return 180/Math.PI*Math.atan(.5*(Math.exp(n)-Math.exp(-n)))}
async function radar(){
  if(radarTiles){G.tilesData(on.rad?radarTiles:[]);return}
  st.rad="cargando…";paintStat();
  try{
    const m=await getJ("https://api.rainviewer.com/public/weather-maps.json");
    const fr=m.radar.past[m.radar.past.length-1];const z=6;
    const Mat=G.globeMaterial().constructor,Tex=(G.globeMaterial().map||{}).constructor;
    if(!Tex)throw Error("sin textura");
    const list=[];
    for(let x=14;x<=18;x++)for(let y=28;y<=31;y++)list.push({x,y});
    const tiles=await Promise.all(list.map(({x,y})=>new Promise(res=>{const im=new Image();im.crossOrigin="anonymous";im.onload=()=>{const tx=new Tex(im);tx.needsUpdate=true;
      const n=t2lat(y,z),s=t2lat(y+1,z),w=x/2**z*360-180,e=(x+1)/2**z*360-180;
      res({lat:(n+s)/2,lng:(w+e)/2,wd:e-w,ht:n-s,mat:new Mat({map:tx,transparent:true,opacity:.85,depthWrite:false})})};im.onerror=()=>res(null);
      im.src=`${m.host}${fr.path}/256/${z}/${x}/${y}/2/1_1.png`})));
    radarTiles=tiles.filter(Boolean);if(!radarTiles.length)throw 0;
    G.tilesData(on.rad?radarTiles:[]).tileLat("lat").tileLng("lng").tileWidth("wd").tileHeight("ht").tileAltitude(.0025).tileMaterial("mat").tileCurvatureResolution(3);
    st.rad=radarTiles.length+" mosaicos · "+new Date(fr.time*1000).toLocaleTimeString("es-CR",{hour:"2-digit",minute:"2-digit"});log("RADAR DE LLUVIA RAINVIEWER CARGADO");
  }catch(e){st.rad=NO;radarTiles=null}
  paintStat();
}
// 5) Rutas: DATOS DE EJEMPLO (luego vendrán de Rutas de la app)
const DEMO="DATOS DE EJEMPLO · no son rutas reales del usuario";
D.rut=[
 {n:"Alajuela centro → Aeropuerto SJO",pts:[[10.0163,-84.2116],[10.0090,-84.2080],[10.0005,-84.2045],[9.9939,-84.2089]],km:"3,2",min:"9"},
 {n:"Alajuela → San José (Ruta 1)",pts:[[10.0163,-84.2116],[10.0005,-84.2045],[9.9860,-84.1720],[9.9580,-84.1320],[9.9420,-84.1010],[9.9330,-84.0800]],km:"19",min:"35"},
 {n:"Alajuela → Heredia",pts:[[10.0163,-84.2116],[10.0120,-84.1800],[10.0050,-84.1450],[9.9980,-84.1170]],km:"11",min:"22"},
 {n:"Alajuela → Grecia",pts:[[10.0163,-84.2116],[10.0400,-84.2550],[10.0600,-84.2950],[10.0730,-84.3110]],km:"14",min:"24"},
].map((r,i)=>({pts:r.pts,c:["#22ff9a","#ff3b5c","#22ff9a","#ffc857"][i],w:3,dash:.3,info:["➝ "+r.n,[["Distancia (ej.)",r.km+" km"],["Tiempo (ej.)",r.min+" min"],["Origen","Demo"]],DEMO]}));
st.rut=D.rut.length+" (ejemplo)";

// ---------- controles ----------
document.querySelectorAll("nav [data-l]").forEach(b=>{const k=b.dataset.l;b.classList.toggle("off",!on[k]);b.onclick=()=>{on[k]=!on[k];b.classList.toggle("off",!on[k]);if(k==="rad"){on.rad?radar():(G.tilesData([]),st.rad="apagado",paintStat())}else render()}});
document.querySelectorAll("nav [data-go]").forEach(b=>b.onclick=()=>G.pointOfView(b.dataset.go==="cr"?CR:b.dataset.go==="gam"?{lat:9.99,lng:-84.17,altitude:.035}:{lat:10,lng:-70,altitude:2.8},2200));
const ctl=G.controls();ctl.minDistance=101;ctl.zoomSpeed=1.2;ctl.enableDamping=true;
paintStat();render();
aviones();sismos();satelites();clima();
setInterval(()=>{if(!document.hidden){on.avi&&aviones();}},30000);
setInterval(()=>{if(!document.hidden){sismos();clima()}},600000);
