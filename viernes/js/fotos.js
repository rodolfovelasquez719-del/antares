// Viernes 0.8.0 - Fotos para vender: quitar fondo (automático / a mano) y afiche de venta. Todo en el teléfono, gratis.
// Lee (sin mostrar) la llave de Gemini guardada por app.js en localStorage solo para entender textos; si falla usa el lector local.
let iniciado=false;const api={};
export function initFotos(){if(iniciado)return;iniciado=true;

const $=id=>document.getElementById(id);
const cv=$('lienzo'),cx=cv.getContext('2d');
const msg=t=>$('msg').textContent=t;
let orig,mask,obj,fondo={tipo:'color',v:'#ffffff'},fondoImg=null,pos={x:.5,y:.5,s:1},modo='mover',pincel='borrar',lib;
const N=1080;cv.width=cv.height=N;
// texturas generadas
function tex(kind){const c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d');
 const ruido=(a)=>{const d=g.getImageData(0,0,N,N);for(let i=0;i<d.data.length;i+=4){const r=(Math.random()-.5)*a;d.data[i]+=r;d.data[i+1]+=r;d.data[i+2]+=r}g.putImageData(d,0,0)};
 if(kind==='madera'){g.fillStyle='#a0703f';g.fillRect(0,0,N,N);for(let y=0;y<N;y+=2){g.strokeStyle=`rgba(${60+Math.random()*40|0},35,15,${.05+Math.random()*.25})`;g.lineWidth=1+Math.random()*3;g.beginPath();g.moveTo(0,y);for(let x=0;x<=N;x+=40)g.lineTo(x,y+Math.sin(x/90+y/50)*6);g.stroke()}ruido(14)}
 if(kind==='marmol'){g.fillStyle='#f3f1ee';g.fillRect(0,0,N,N);for(let k=0;k<26;k++){g.strokeStyle=`rgba(120,120,130,${.05+Math.random()*.2})`;g.lineWidth=.5+Math.random()*2.5;g.beginPath();let x=Math.random()*N,y=0;g.moveTo(x,y);while(y<N){x+=(Math.random()-.5)*60;y+=20+Math.random()*30;g.lineTo(x,y)}g.stroke()}g.filter='blur(1px)';g.drawImage(c,0,0);g.filter='none';ruido(8)}
 if(kind==='tela'){g.fillStyle='#e9dcc9';g.fillRect(0,0,N,N);for(let i=0;i<N;i+=3){g.fillStyle=`rgba(0,0,0,${Math.random()*.06})`;g.fillRect(i,0,1.5,N);g.fillStyle=`rgba(255,255,255,${Math.random()*.08})`;g.fillRect(0,i,N,1.5)}ruido(10)}
 if(kind==='lino'){g.fillStyle='#c7b8d8';g.fillRect(0,0,N,N);for(let i=0;i<N;i+=4){g.fillStyle=`rgba(60,30,80,${Math.random()*.07})`;g.fillRect(i,0,2,N);g.fillRect(0,i,N,2)}ruido(12)}
 return c}
const FONDOS=[['#ffffff','Blanco'],['#000000','Negro'],['#f8d7e3','Rosa'],['#e8e0d0','Crema'],['#cfe8e0','Menta'],['#d9e6f5','Cielo'],
 ['g:#fde2e4,#e2d1f9','Suave'],['g:#fff1d6,#ffd1dc','Durazno'],['g:#d4fc79,#96e6a1','Verde'],['g:#2c1a4d,#6b2d5c','Noche'],
 ['t:madera','Madera'],['t:marmol','Mármol'],['t:tela','Tela'],['t:lino','Lino lila']];
const texCache={};
FONDOS.forEach(([v,n],i)=>{const b=document.createElement('button');b.textContent=n;
 if(v[0]==='#')b.style.background=v;else if(v.startsWith('g:'))b.style.background=`linear-gradient(160deg,${v.slice(2)})`;
 else{texCache[v]=tex(v.slice(2));b.style.background=`url(${texCache[v].toDataURL('image/jpeg',.6)}) center/cover`}
 if(v==='#000000'||v.includes('2c1a4d'))b.style.color='#fff';
 b.onclick=()=>{document.querySelectorAll('#fondos button').forEach(x=>x.classList.remove('on'));b.classList.add('on');fondo={v};fondoImg=null;dibujar()};
 if(i===0)b.classList.add('on');$('fondos').append(b)});
function pintarFondo(g){const v=fondo.v;
 if(fondoImg){const s=Math.max(N/fondoImg.width,N/fondoImg.height);g.drawImage(fondoImg,(N-fondoImg.width*s)/2,(N-fondoImg.height*s)/2,fondoImg.width*s,fondoImg.height*s)}
 else if(v[0]==='#'){g.fillStyle=v;g.fillRect(0,0,N,N)}
 else if(v.startsWith('g:')){const [a,b]=v.slice(2).split(',');const gr=g.createLinearGradient(0,0,N*.4,N);gr.addColorStop(0,a);gr.addColorStop(1,b);g.fillStyle=gr;g.fillRect(0,0,N,N)}
 else g.drawImage(texCache[v],0,0)}
function rect(){const s=Math.min(N*.85/obj.width,N*.85/obj.height)*pos.s;const w=obj.width*s,h=obj.height*s;return{x:pos.x*N-w/2,y:pos.y*N-h/2,w,h,s}}
function rehacerObj(){const g=obj.getContext('2d');g.globalCompositeOperation='copy';g.drawImage(orig,0,0);g.globalCompositeOperation='destination-in';g.drawImage(mask,0,0);g.globalCompositeOperation='source-over'}
function dibujar(){cx.clearRect(0,0,N,N);pintarFondo(cx);const r=rect();const sh=+$('sombra').value;
 if(sh){cx.save();cx.shadowColor=`rgba(0,0,0,${sh/160})`;cx.shadowBlur=10+sh*.5;cx.shadowOffsetY=6+sh*.25;cx.drawImage(obj,r.x,r.y,r.w,r.h);cx.restore()}
 cx.drawImage(obj,r.x,r.y,r.w,r.h)}
async function cargarLib(){if(!lib){msg('⏳ Preparando el borrador mágico (solo la primera vez tarda)…');lib=await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm')}return lib}

// Quedarse solo con el objeto principal (componente conexa más grande) y recortar a su tamaño
function limpiar(){const W=mask.width,H=mask.height,k=Math.min(1,320/Math.max(W,H)),w=Math.max(1,Math.round(W*k)),h=Math.max(1,Math.round(H*k));
 const sc=document.createElement('canvas');sc.width=w;sc.height=h;const sg=sc.getContext('2d');sg.drawImage(mask,0,0,w,h);const a=sg.getImageData(0,0,w,h).data;
 const bin=new Uint8Array(w*h);for(let i=0;i<w*h;i++)bin[i]=a[i*4+3]>110?1:0;const bin0=bin.slice();
 {// quitar partes finas y grises (hilos, vetas del mármol): apertura morfológica + color
 const oc2=document.createElement('canvas');oc2.width=w;oc2.height=h;const og=oc2.getContext('2d');og.drawImage(orig,0,0,w,h);const c=og.getImageData(0,0,w,h).data;
 const r=Math.max(1,Math.round(Math.max(w,h)*.012));const morf=(src,val)=>{const o=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=!val;out:for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const X=x+dx,Y=y+dy;const b=(X>=0&&Y>=0&&X<w&&Y<h)?src[Y*w+X]:0;if(b==val){v=val;break out}}o[y*w+x]=v?1:0}return o};
 const op=morf(morf(bin,0),1);for(let i=0;i<w*h;i++)if(bin[i]&&!op[i]){const R_=c[i*4],G=c[i*4+1],B=c[i*4+2],mx=Math.max(R_,G,B),mn=Math.min(R_,G,B);if(mx-mn<30&&mn>120)bin[i]=0}}
 const thin=new Uint8Array(w*h);for(let i=0;i<w*h;i++)thin[i]=bin0[i]&&!bin[i]?1:0;
 const R=Math.max(2,Math.round(Math.max(w,h)*.015)),dil=new Uint8Array(w*h);// dilatar para unir cierres/cadenas
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(bin[y*w+x])for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<w&&Y<h)dil[Y*w+X]=1}
 const lab=new Int32Array(w*h),area=[0];let n=0;const st=[];
 for(let i=0;i<w*h;i++)if(dil[i]&&!lab[i]){n++;area[n]=0;lab[i]=n;st.push(i);while(st.length){const j=st.pop();area[n]+=bin[j];const x=j%w,y=j/w|0;for(const q of [x>0?j-1:-1,x<w-1?j+1:-1,y>0?j-w:-1,y<h-1?j+w:-1])if(q>=0&&dil[q]&&!lab[q]){lab[q]=n;st.push(q)}}}
 if(n<1)return;let best=1;for(let i=2;i<=n;i++)if(area[i]>area[best])best=i;
 // borrar todo lo que no es el objeto principal
 const keep=sg.createImageData(w,h);let x0=w,y0=h,x1=0,y1=0;for(let i=0;i<w*h;i++)if(lab[i]===best&&(bin[i]||a[i*4+3]>110&&!thin[i])){keep.data[i*4+3]=255;if(bin[i]){const x=i%w,y=i/w|0;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}}
 sg.putImageData(keep,0,0);const mg=mask.getContext('2d');mg.globalCompositeOperation='destination-in';mg.imageSmoothingEnabled=true;mg.drawImage(sc,0,0,W,H);mg.globalCompositeOperation='source-over';
 // limpiar transparencias débiles (hilos, sombras)
 const md=mg.getImageData(0,0,W,H);for(let i=3;i<md.data.length;i+=4)if(md.data[i]<60)md.data[i]=0;mg.putImageData(md,0,0);
 const pad=Math.round(Math.max(W,H)*.03),X0=Math.max(0,Math.floor(x0/k)-pad),Y0=Math.max(0,Math.floor(y0/k)-pad),X1=Math.min(W,Math.ceil((x1+1)/k)+pad),Y1=Math.min(H,Math.ceil((y1+1)/k)+pad);
 const crop=(c)=>{const n=document.createElement('canvas');n.width=X1-X0;n.height=Y1-Y0;n.getContext('2d').drawImage(c,X0,Y0,n.width,n.height,0,0,n.width,n.height);return n};
 mask=crop(mask);orig=crop(orig)}

// 0.8.1: quitar la superficie (almohadilla, tela, mesa) que quedó DENTRO de la joya.
// Busca el punto más interno del recorte, crece una zona de color parecido (mate) y la borra si es grande.
function lab(r,g,b){const f=c=>{c/=255;return c>.04045?Math.pow((c+.055)/1.055,2.4):c/12.92};r=f(r);g=f(g);b=f(b);
 let x=(r*.4124+g*.3576+b*.1805)/.95047,y=r*.2126+g*.7152+b*.0722,z=(r*.0193+g*.1192+b*.9505)/1.08883;const h=t=>t>.008856?Math.cbrt(t):7.787*t+16/116;x=h(x);y=h(y);z=h(z);return[116*y-16,500*(x-y),200*(y-z)]}
function zonaLow(th=110){const W=mask.width,H=mask.height,k=Math.min(1,560/Math.max(W,H)),w=Math.max(1,Math.round(W*k)),h=Math.max(1,Math.round(H*k));
 const c1=document.createElement('canvas');c1.width=w;c1.height=h;const g1=c1.getContext('2d');g1.filter='blur(1.2px)';g1.drawImage(orig,0,0,w,h);const px=g1.getImageData(0,0,w,h).data;
 const c2=document.createElement('canvas');c2.width=w;c2.height=h;const g2=c2.getContext('2d');g2.drawImage(mask,0,0,w,h);const al=g2.getImageData(0,0,w,h).data;
 const L=new Float32Array(w*h*3),fg=new Uint8Array(w*h);for(let i=0;i<w*h;i++){const v=lab(px[i*4],px[i*4+1],px[i*4+2]);L[i*3]=v[0];L[i*3+1]=v[1];L[i*3+2]=v[2];fg[i]=al[i*4+3]>th?1:0}
 return{W,H,w,h,k,L,fg}}
function crecer(Z,seed,tol){const{w,h,L,fg}=Z;const reg=new Uint8Array(w*h);const st=[seed];reg[seed]=1;let n=0,m=[L[seed*3],L[seed*3+1],L[seed*3+2]],cnt=1;
 while(st.length){const j=st.pop();n++;const x=j%w,y=j/w|0;for(const q of [x>0?j-1:-1,x<w-1?j+1:-1,y>0?j-w:-1,y<h-1?j+w:-1]){if(q<0||reg[q]||!fg[q])continue;
  const d=Math.hypot(L[q*3]-m[0],(L[q*3+1]-m[1])*1.3,(L[q*3+2]-m[2])*1.3),dn=Math.hypot(L[q*3]-L[j*3],L[q*3+1]-L[j*3+1],L[q*3+2]-L[j*3+2]);
  if(d<tol&&dn<tol*.45){reg[q]=1;st.push(q);if(cnt<4000){cnt++;for(let t=0;t<3;t++)m[t]+=(L[q*3+t]-m[t])/cnt}}}}
 return{reg,n,m}}
function borrarZona(Z,reg){const{w,h,W,H}=Z;// dilatar 1 px para llevarse el borde
 const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');const id=g.createImageData(w,h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;let v=reg[i];if(!v)for(const q of [i-1,i+1,i-w,i+w])if(q>=0&&q<w*h&&reg[q]){v=1;break}if(v)id.data[i*4+3]=255}
 g.putImageData(id,0,0);const mg=mask.getContext('2d');mg.globalCompositeOperation='destination-out';mg.drawImage(c,0,0,W,H);mg.globalCompositeOperation='source-over'}
function quitarSuperficie(minFrac=.15,forzar=false){const Z=zonaLow();const{w,h,fg,L}=Z;let total=0;for(let i=0;i<w*h;i++)total+=fg[i];if(!total)return 0;let quitadas=0;
 for(let it=0;it<3;it++){// distancia al borde (2 pasadas)
  const d=new Float32Array(w*h);for(let i=0;i<w*h;i++)d[i]=fg[i]?1e9:0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!d[i])continue;d[i]=Math.min(d[i],x?d[i-1]+1:1,y?d[i-w]+1:1,x&&y?d[i-w-1]+1.414:1,y&&x<w-1?d[i-w+1]+1.414:1)}
  for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;if(!d[i])continue;d[i]=Math.min(d[i],x<w-1?d[i+1]+1:1,y<h-1?d[i+w]+1:1,x<w-1&&y<h-1?d[i+w+1]+1.414:1,y<h-1&&x?d[i+w-1]+1.414:1)}
  let best=-1,bd=0;for(let i=0;i<w*h;i++)if(d[i]>bd){bd=d[i];best=i}if(best<0)break;
  const{reg,n,m}=crecer(Z,best,16);const sat=Math.hypot(m[1],m[2]);
  let x0=w,y0=h,x1=0,y1=0;for(let i=0;i<w*h;i++)if(reg[i]){const x=i%w,y=i/w|0;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
  const comp=n/((x1-x0+1)*(y1-y0+1));// superficie = zona llena (no una tira de sombra)
  if(!(n/total>=minFrac&&(forzar||(sat<45&&comp>.35))))break;
  // segunda pasada: restos del mismo color dentro de esa zona (bordes entre cuentas)
  const cand=new Uint8Array(w*h);const mx=Math.round((x1-x0)*.08),my=Math.round((y1-y0)*.08);
  for(let y=Math.max(0,y0-my);y<=Math.min(h-1,y1+my);y++)for(let x=Math.max(0,x0-mx);x<=Math.min(w-1,x1+mx);x++){const i=y*w+x;if(fg[i]&&!reg[i]&&L[i*3+2]<m[2]+10&&Math.hypot(L[i*3]-m[0],(L[i*3+1]-m[1])*1.3,(L[i*3+2]-m[2])*1.3)<24)cand[i]=1}
  {let band=reg.slice();for(let r=0;r<6;r++){const nb=band.slice();for(let i=0;i<w*h;i++)if(cand[i]&&!band[i]){const x=i%w;if((x>0&&band[i-1])||(x<w-1&&band[i+1])||(i>=w&&band[i-w])||(i+w<w*h&&band[i+w]))nb[i]=1}band=nb}for(let i=0;i<w*h;i++)if(band[i])reg[i]=1}
  borrarZona(Z,reg);for(let i=0;i<w*h;i++)if(reg[i])fg[i]=0;quitadas++}
 return quitadas}
// tocar para quitar una zona del mismo color
function quitarZonaEn(mx,my){const Z=zonaLow(16);const x=Math.round(mx*Z.k),y=Math.round(my*Z.k);if(x<0||y<0||x>=Z.w||y>=Z.h)return;let i=y*Z.w+x;
 if(!Z.fg[i]){let bd=1e9,bi=-1;for(let dy=-8;dy<=8;dy++)for(let dx=-8;dx<=8;dx++){const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<Z.w&&Y<Z.h&&Z.fg[Y*Z.w+X]&&dx*dx+dy*dy<bd){bd=dx*dx+dy*dy;bi=Y*Z.w+X}}if(bi<0){msg('Tocá encima de lo que querés quitar');return}i=bi}
 const{reg}=crecer(Z,i,14);borrarZona(Z,reg)}
async function procesar(file,auto){$('elegir').disabled=true;$('editor').style.display='none';cv.style.display='none';
 try{const L=await cargarLib();
  orig=await createImageBitmap(file);
  // reducir para teléfono
  const M=1600,k=Math.min(1,M/Math.max(orig.width,orig.height));const oc=document.createElement('canvas');oc.width=orig.width*k|0;oc.height=orig.height*k|0;oc.getContext('2d').drawImage(orig,0,0,oc.width,oc.height);orig=oc;
  const blobIn=await new Promise(r=>oc.toBlob(r,'image/png'));
  const t0=performance.now();
  const out=await L.removeBackground(blobIn,{model:'isnet_fp16',output:{format:'image/png'},progress:(key,cur,tot)=>{if(key.startsWith('fetch'))msg(`⏳ Descargando borrador mágico… ${Math.round(cur/tot*100)}%`);else msg('✂️ Quitando el fondo…')}});
  const cut=await createImageBitmap(out);
  mask=document.createElement('canvas');mask.width=oc.width;mask.height=oc.height;mask.getContext('2d').drawImage(cut,0,0,oc.width,oc.height);
  limpiar();try{const q=quitarSuperficie();if(q)console.log('superficie quitada',q)}catch(e){console.warn(e)}
  obj=document.createElement('canvas');obj.width=mask.width;obj.height=mask.height;rehacerObj();
  pos={x:.5,y:.5,s:1};$('tam').value=100;cv.style.display='block';$('editor').style.display='block';$('herr').style.display=auto?'none':'block';$('aMano').style.display=auto?'block':'none';if(auto)$('auto').style.display='none';dibujar();
  window.__listo=((performance.now()-t0)/1000).toFixed(1);if(!auto)msg('✅ ¡Listo! Ahora elegí un fondo');
 return true}catch(e){console.error(e);msg('😕 No pude quitar el fondo. Probá otra foto.')}
 $('elegir').disabled=false}
$('elegir').onclick=$('otra').onclick=()=>$('archivo').click();
$('archivo').onchange=e=>{const f=e.target.files[0];if(f)procesar(f);e.target.value=''};
$('miFondo').onclick=()=>$('archivoFondo').click();
$('archivoFondo').onchange=async e=>{const f=e.target.files[0];if(!f)return;fondoImg=await createImageBitmap(f);document.querySelectorAll('#fondos button').forEach(x=>x.classList.remove('on'));dibujar()};
document.querySelectorAll('#editor .fo-tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#editor .fo-tabs button,#editor .fo-panel').forEach(x=>x.classList.remove('on'));b.classList.add('on');$(b.dataset.p).classList.add('on');modo=b.dataset.p==='pRetocar'?'pincel':'mover'});
$('tam').oninput=()=>{pos.s=$('tam').value/100;dibujar()};$('sombra').oninput=dibujar;
$('centrar').onclick=()=>{pos={x:.5,y:.5,s:1};$('tam').value=100;dibujar()};
const selP=(p,id)=>{pincel=p;['bBorrar','bRec','bZona'].forEach(x=>$(x).classList.toggle('on',x===id))};
$('bBorrar').onclick=()=>selP('borrar','bBorrar');$('bRec').onclick=()=>selP('rec','bRec');$('bZona').onclick=()=>selP('zona','bZona');
$('bAdentro').onclick=()=>{const q=quitarSuperficie(.03,true);rehacerObj();dibujar();msg(q?'✅ Quité lo de adentro':'No encontré nada más que quitar')};
// toques
const dedos=new Map();let ini=null;
const pt=e=>{const b=cv.getBoundingClientRect();return{x:(e.clientX-b.left)/b.width,y:(e.clientY-b.top)/b.height}};
function pintar(p,ini){const r=rect();const mx=(p.x*N-r.x)/r.s,my=(p.y*N-r.y)/r.s;if(pincel==='zona'){if(ini){quitarZonaEn(mx,my);rehacerObj();dibujar()}return}const g=mask.getContext('2d');const rad=+$('grosor').value/r.s;
 if(pincel==='borrar'){g.globalCompositeOperation='destination-out';g.fillStyle='#000'}else{g.globalCompositeOperation='source-over';g.fillStyle='#fff'}
 g.beginPath();g.arc(mx,my,rad,0,7);g.fill();g.globalCompositeOperation='source-over';rehacerObj();dibujar()}
cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);dedos.set(e.pointerId,pt(e));
 if(modo==='pincel'){pintar(pt(e),true);return}
 const a=[...dedos.values()];ini={pos:{...pos},a:a.map(p=>({...p})),d:a.length>1?Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y):0}});
cv.addEventListener('pointermove',e=>{if(!dedos.has(e.pointerId))return;dedos.set(e.pointerId,pt(e));
 if(modo==='pincel'){pintar(pt(e));return}
 const a=[...dedos.values()];if(!ini)return;
 if(a.length>1&&ini.d){pos.s=Math.max(.2,Math.min(2.5,ini.pos.s*Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)/ini.d));$('tam').value=pos.s*100}
 else{pos.x=ini.pos.x+a[0].x-ini.a[0].x;pos.y=ini.pos.y+a[0].y-ini.a[0].y}dibujar()});

const marcar=()=>document.querySelectorAll('#fondos button').forEach(x=>x.classList.toggle('on',FONDOS[[...x.parentNode.children].indexOf(x)][0]===fondo.v&&!fondoImg));
$('mMano').onclick=()=>{$('modos').style.display='none';$('elegir').style.display='block';$('archivo').click()};
$('mAuto').onclick=()=>{$('modos').style.display='none';$('auto').style.display='block'};
$('aVolver').onclick=$('inicio').onclick=()=>{['auto','elegir','editor'].forEach(i=>$(i).style.display='none');cv.style.display='none';$('modos').style.display='block';msg('')};
let aFile=null,aFondo=null;
const fp=document.createElement('input');fp.type='file';fp.accept='image/*';
const pedir=()=>new Promise(r=>{fp.onchange=()=>{r(fp.files[0]);fp.value=''};fp.oncancel=()=>r(null);fp.click()});
$('aFoto').onclick=async()=>{const f=await pedir();if(f){aFile=f;$('aPrev').innerHTML=`<img src="${URL.createObjectURL(f)}" style="max-width:60%;max-height:160px;border-radius:12px">`}};
const norm=t=>t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const quiereFoto=t=>/(foto|imagen) (de|para el) fondo|esta foto|mi foto|mi propia/.test(norm(t));
$('aTexto').oninput=()=>$('aFondoFoto').style.display=quiereFoto($('aTexto').value)?'block':'none';
$('aFondoFoto').onclick=async()=>{const f=await pedir();if(f){aFondo=await createImageBitmap(f);$('aFondoFoto').textContent='✅ Foto de fondo elegida'}};
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
if(!SR)$('aMic').style.display='none';else $('aMic').onclick=()=>{const r=new SR();r.lang='es-CR';r.interimResults=false;$('aMic').textContent='🎙️ Te escucho…';
 r.onresult=e=>{$('aTexto').value=e.results[0][0].transcript;$('aTexto').oninput()};r.onend=()=>$('aMic').textContent='🎤 Dictar';r.onerror=()=>msg('No te escuché bien, probá de nuevo');r.start()};
const COL={blanc:'#ffffff',negr:'#111111',ros:'#f8c8dc',fucsi:'#ff5fa8',crema:'#efe6d6',beige:'#e8dcc8',menta:'#cfe8e0',verde:'#b8e0c0',celest:'#cfe3f7',azul:'#a9c8f0',cielo:'#d9e6f5',lila:'#d8c8f0',morad:'#b48cff',violet:'#b48cff',durazno:'#ffd8bf',naranj:'#ffc08a',amarill:'#fff0a8',dorad:'#e8c872',gris:'#d6d6d6',roj:'#f08080',cafe:'#a07850',turques:'#9de0d8'};
const aclara=h=>{const n=parseInt(h.slice(1),16),f=c=>Math.round(c+(255-c)*.6);return'#'+[n>>16,n>>8&255,n&255].map(c=>f(c).toString(16).padStart(2,'0')).join('')};
function parsear(texto){const t=norm(texto);const c={fondo:'#ffffff',tam:100,sombra:35,foto:false};
 const cols=[];for(const k in COL){const i=t.search(new RegExp('\\b'+k));if(i>=0)cols.push([i,COL[k]])}cols.sort((a,b)=>a[0]-b[0]);
 if(/vender|venta|catalogo|tienda|producto|profesional/.test(t)){c.fondo='#ffffff';c.sombra=30}
 if(cols.length)c.fondo=cols[0][1];
 if(/degrad|difumin|suave|pastel/.test(t))c.fondo='g:'+(cols.length>1?cols[0][1]+','+cols[1][1]:cols.length?aclara(cols[0][1])+','+cols[0][1]:'#fde2e4,#e2d1f9');
 for(const [k,v] of [['marmol','t:marmol'],['madera','t:madera'],['mesa','t:madera'],['lino','t:lino'],['tela','t:tela'],['manta','t:tela'],['tejid','t:tela']])if(t.includes(k)){c.fondo=v;break}
 if(quiereFoto(texto))c.foto=true;
 if(/mucho mas grande|bien grande|enorme|grandot/.test(t))c.tam=150;else if(/mas grande|agrand|grande/.test(t))c.tam=125;
 if(/mucho mas peque|bien peque|chiquit/.test(t))c.tam=60;else if(/mas peque|achic|peque|chiqu/.test(t))c.tam=78;
 if(/sin sombra/.test(t))c.sombra=0;else if(/mucha sombra|sombra fuerte|bastante sombra/.test(t))c.sombra=85;else if(/poca sombra|sombra suave|sombrita/.test(t))c.sombra=25;else if(/sombra/.test(t))c.sombra=55;
 return c}
async function conGemini(texto){let cfg;try{cfg=JSON.parse(localStorage.getItem('viernes.config.v1')||localStorage.getItem('viernes.config.bak'))}catch{}
 const k=cfg&&((cfg.keys&&cfg.keys[0])||cfg.key);if(!k)return null;
 const pr=`Convierte la instrucción de una artesana para editar la foto de su joya en JSON con: tipo ("color"|"degradado"|"textura"|"foto"), color1 (hex), color2 (hex, para degradado), textura ("madera"|"marmol"|"tela"|"lino"), tamano (20-250, 100 normal), sombra (0-100, 35 normal). Si dice para vender o catálogo usa blanco. Solo JSON.\nInstrucción: ${texto}`;
 try{const ctl=new AbortController();setTimeout(()=>ctl.abort(),8000);
  const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',{method:'POST',signal:ctl.signal,headers:{'Content-Type':'application/json','x-goog-api-key':k},body:JSON.stringify({contents:[{parts:[{text:pr}]}],generationConfig:{responseMimeType:'application/json',temperature:0}})});
  if(!r.ok)return null;const j=JSON.parse((await r.json()).candidates[0].content.parts[0].text);
  const hx=v=>/^#[0-9a-f]{6}$/i.test(v||'')?v:null,cl=(v,a,b,d)=>isFinite(+v)?Math.max(a,Math.min(b,+v)):d;
  const c={fondo:hx(j.color1)||'#ffffff',tam:cl(j.tamano,20,250,100),sombra:cl(j.sombra,0,100,35),foto:j.tipo==='foto'};
  if(j.tipo==='degradado')c.fondo='g:'+(hx(j.color1)||'#fde2e4')+','+(hx(j.color2)||'#e2d1f9');
  if(j.tipo==='textura'&&['madera','marmol','tela','lino'].includes(j.textura))c.fondo='t:'+j.textura;
  return c}catch{return null}}
$('aHacer').onclick=async()=>{if(!aFile){msg('Primero elegí la foto de tu joya 📷');return}
 const texto=$('aTexto').value.trim()||'fondo blanco para vender';
 msg('🪄 Entendiendo lo que querés…');
 const c=(await conGemini(texto))||parsear(texto);
 if(c.foto&&!aFondo){msg('Elegí la foto de fondo 🖼️');const f=await pedir();if(f)aFondo=await createImageBitmap(f);else msg('Sin foto de fondo, uso blanco')}
 if(!await procesar(aFile,true))return;
 if(c.fondo.startsWith('t:')&&!texCache[c.fondo])texCache[c.fondo]=tex(c.fondo.slice(2));
 fondo={v:c.fondo};fondoImg=c.foto&&aFondo?aFondo:null;pos={x:.5,y:.5,s:c.tam/100};$('tam').value=c.tam;$('sombra').value=c.sombra;marcar();dibujar();
 window.__auto=c;msg('✅ ¡Listo! Si te gusta, compartila');cv.scrollIntoView({behavior:'smooth'})};
$('aMano').onclick=()=>{$('herr').style.display='block';$('aMano').style.display='none';msg('✋ Ajustá lo que quieras')};


// ======== AFICHE DE VENTA ========
let afFile=null,plant='chicle',AF={},detPts=[];
$('mAfiche').onclick=()=>{$('modos').style.display='none';$('af').style.display='block'};
$('afVolver').onclick=()=>{$('af').style.display='none';$('afRes').style.display='none';$('modos').style.display='block';msg('')};
$('afFoto').onclick=async()=>{const f=await pedir();if(f){afFile=f;$('afPrev').innerHTML=`<img src="${URL.createObjectURL(f)}" style="max-width:60%;max-height:160px;border-radius:12px">`}};
if(!SR)$('afMic').style.display='none';else $('afMic').onclick=()=>{const r=new SR();r.lang='es-CR';$('afMic').textContent='🎙️ Te escucho…';r.onresult=e=>$('afTexto').value=e.results[0][0].transcript;r.onend=()=>$('afMic').textContent='🎤 Dictar';r.start()};
$('afPlant2').innerHTML=$('afPlant').innerHTML;
document.querySelectorAll('#afPlant button,#afPlant2 button').forEach(b=>b.onclick=()=>{plant=b.dataset.t;document.querySelectorAll('#afPlant button,#afPlant2 button').forEach(x=>x.classList.toggle('on',x.dataset.t===plant));if(AF.listo)afiche()});
const cap=t=>t.charAt(0).toUpperCase()+t.slice(1);
const TIPOS=['collar','pulsera','brazalete','aretes','arete','tobillera','anillo','cadena','gargantilla','choker','llavero','set','juego'];
const ICON=[[/cierre|broche|langosta/,'🔗'],[/cuenta|bola|chicle|perla/,'⭐'],[/material|calidad|resist|acero|plata|oro|dorad/,'🌿'],[/color|pastel|vibrant/,'🌸'],[/ocasion|regal|todo/,'💛'],[/mano|artesan/,'🤲'],[/ajust|extens|tama/,'📏'],[/piedra|cristal|brill/,'💎'],[/coraz|amor/,'❤️']];
const icono=(t,i)=>{const n=norm(t);for(const [r,e] of ICON)if(r.test(n))return e;return['⭐','🌿','🌸','💛','💎','✨'][i%6]};
function precioDe(t){const n=norm(t);let m=n.match(/(?:₡|c\/|precio|cuesta|vale|\ba)\s*:?\s*(\d[\d.,]*)\s*(mil)?/)||n.match(/(\d[\d.,]*)\s*(mil)?\s*(?:colones|cones|₡|rojos)/)||n.match(/\b(\d{4,6}|\d{1,2}\s*mil)\b/);
 if(!m)return'';let v=parseFloat(String(m[1]).replace(/[.,](?=\d{3}\b)/g,'').replace(',','.'));if(/mil/.test(m[0]))v*=1000;return v>=100?String(Math.round(v)):''}
function parsearAfiche(texto){const partes=texto.split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
 const precio=precioDe(texto);const sinP=partes.filter(x=>!/(₡|colon|precio|cuesta|vale|\b\d{3,}\b|\bmil\b)/i.test(x));
 let tit=sinP.shift()||'Mi joya';const n=norm(tit);const tipo=TIPOS.find(k=>n.startsWith(k))||TIPOS.find(k=>n.includes(k))||'';
 let sub='';const tw=tit.split(/\s+/);if(tw.length>6){sub=tw.slice(1,5).join(' ').replace(/\s+(de|con|y|para|del|la|el)$/i,'');tit=tw[0];sinP.unshift(tw.slice(5).join(' '))}else if(tw.length>2){sub=tw.slice(1).join(' ');tit=tw[0]}else if(tw.length===2){sub=tw[1];tit=tw[0]}
 let frase='';const fi=sinP.findIndex(x=>/(divert|unic|colorid|elegant|delicad|lind|hermos|tiern|moderno|bonit)/i.test(norm(x))&&x.split(' ').length<=6);
 if(fi>=0)frase=sinP.splice(fi,1)[0].split(/\s+/).map(cap).join(' • ');
 const feats=sinP.map(x=>{const w=x.split(/\s+/);return cap(w.length>6?w.slice(0,6).join(' ').replace(/\s+(de|con|y|para|del|la|el)$/i,''):x)}).slice(0,5);while(feats.length<3)feats.push(['Hecho a mano en Costa Rica','Ideal para cualquier ocasión','Diseño único'][feats.length]);
 const det=feats.filter(f=>/cierre|broche|cuenta|perla|dije|detalle|piedra/i.test(f));
 const d1=feats.find(f=>/cierre|broche|langosta/i.test(f))||'Detalle del cierre';const d2=feats.some(f=>/cuenta|perla|bola|chicle/i.test(f))?'Detalle de las cuentas':'Detalle hecho a mano';
 return{tit:cap(tit),sub:sub?cap(sub):'hecho a mano',frase:frase||'Hecho a mano con amor 💗',feats,d1,d2,precio}}
async function afGemini(texto){let cfg;try{cfg=JSON.parse(localStorage.getItem('viernes.config.v1')||localStorage.getItem('viernes.config.bak'))}catch{}
 const k=cfg&&((cfg.keys&&cfg.keys[0])||cfg.key);if(!k)return null;
 const pr=`Una artesana de Costa Rica describe su joya para un afiche de venta. Devuelve SOLO JSON: {"tit":"tipo de joya, 1 palabra (Collar, Pulsera...)","sub":"resto del nombre, corto","frase":"3 palabras separadas por ' • '","feats":["3 a 5 características cortas, máx 5 palabras c/u"],"d1":"rótulo corto del detalle 1 (ej. cierre)","d2":"rótulo corto del detalle 2","precio":"solo número en colones o vacío"}. No inventes precio.\nTexto: ${texto}`;
 try{const ctl=new AbortController();setTimeout(()=>ctl.abort(),9000);
  const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',{method:'POST',signal:ctl.signal,headers:{'Content-Type':'application/json','x-goog-api-key':k},body:JSON.stringify({contents:[{parts:[{text:pr}]}],generationConfig:{responseMimeType:'application/json',temperature:.3}})});
  if(!r.ok)return null;const j=JSON.parse((await r.json()).candidates[0].content.parts[0].text);
  if(!j.tit||!Array.isArray(j.feats))return null;j.feats=j.feats.slice(0,5).map(String);j.precio=String(j.precio||'').replace(/\D/g,'');return j}catch{return null}}
const CAMPOS={tit:'fTit',sub:'fSub',frase:'fFra',d1:'fD1',d2:'fD2',precio:'fPre'};
function aCampos(d){for(const k in CAMPOS)$(CAMPOS[k]).value=d[k]||'';$('fCar').value=d.feats.join('\n')}
function deCampos(){const d={};for(const k in CAMPOS)d[k]=$(CAMPOS[k]).value.trim();d.feats=$('fCar').value.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,5);return d}
document.querySelectorAll('#afRes .fo-campo').forEach(e=>e.oninput=()=>afiche());
// puntos de detalle sobre la joya
function puntos(azar){const w=mask.width,h=mask.height,a=mask.getContext('2d').getImageData(0,0,w,h).data;const op=[];const st=Math.max(2,Math.round(Math.max(w,h)/200));
 let x0=w,y0=h,x1=0,y1=0;for(let y=0;y<h;y+=st)for(let x=0;x<w;x+=st)if(a[(y*w+x)*4+3]>160){op.push([x,y]);if(x<x0)x0=x;if(y<y0)y0=y;if(x>x1)x1=x;if(y>y1)y1=y}
 const r=Math.max(x1-x0,y1-y0)*.13+10;if(!op.length)return[[w/2,h/3,r],[w/2,h*2/3,r]];
 if(azar){const p=()=>op[Math.random()*op.length|0];let A=p(),B=p();for(let i=0;i<30&&Math.hypot(A[0]-B[0],A[1]-B[1])<r*2.5;i++)B=p();return[[...A,r],[...B,r]]}
 const top=op.reduce((m,p)=>p[1]<m[1]?p:m),bot=op.reduce((m,p)=>p[1]>m[1]?p:m);return[[top[0],top[1]+r*.6,r],[bot[0],bot[1]-r*.6,r]]}
$('afDet').onclick=()=>{detPts=puntos(true);afiche()};
$('afHacer').onclick=async()=>{if(!afFile){msg('Primero elegí la foto de tu joya 📷');return}
 const texto=$('afTexto').value.trim()||'Collar hecho a mano';msg('🪄 Leyendo lo que escribiste…');
 const d=(await afGemini(texto))||parsearAfiche(texto);aCampos(d);
 $('af').style.display='none';const ok=await procesar(afFile,true);$('editor').style.display='none';cv.style.display='none';$('af').style.display='block';
 if(!ok)return;detPts=puntos(false);AF.listo=true;$('afRes').style.display='block';await Promise.all(['700 40px Fredoka','600 40px Fredoka','400 40px "Great Vibes"','600 40px "Playfair Display"','italic 500 40px "Playfair Display"','600 40px Quicksand'].map(f=>document.fonts.load(f).catch(()=>0)));afiche();window.__afiche=deCampos();
 msg('✅ ¡Tu afiche está listo!');$('afCv').scrollIntoView({behavior:'smooth'})};
// ---- dibujo ----
const afc=$('afCv'),ag=afc.getContext('2d');
function pill(g,x,y,w,h,fill,stroke){g.beginPath();g.roundRect(x,y,w,h,h/2);g.fillStyle=fill;g.fill();if(stroke){g.lineWidth=4;g.strokeStyle=stroke;g.stroke()}}
function texto(g,t,x,y,maxW,lh,font,color,align='left'){g.font=font;g.fillStyle=color;g.textAlign=align;g.textBaseline='middle';const ws=String(t).split(' ');let l='',ls=[];for(const w of ws){const p=l?l+' '+w:w;if(g.measureText(p).width>maxW&&l){ls.push(l);l=w}else l=p}ls.push(l);ls.forEach((L,i)=>g.fillText(L,x,y+(i-(ls.length-1)/2)*lh));return ls.length}
function fit(g,t,maxW,size,fam,min=20){let s=size;do{g.font=`${fam.w||700} ${s}px ${fam.f}`;s-=2}while(g.measureText(t).width>maxW&&s>min);return g.font}
function corto(g,t,maxW){t=String(t);if(g.measureText(t).width<=maxW)return t;while(t.length>1&&g.measureText(t+'…').width>maxW)t=t.slice(0,-1);return t.trim()+'…'}
function ajoya(g,x,y,w,h,sh=.35){const s=Math.min(w/obj.width,h/obj.height),W=obj.width*s,H=obj.height*s;g.save();g.shadowColor=`rgba(80,30,60,${sh})`;g.shadowBlur=40;g.shadowOffsetY=18;g.drawImage(obj,x+(w-W)/2,y+(h-H)/2,W,H);g.restore()}
function burbuja(g,i,cx,cy,R,borde){const [px,py,r]=detPts[i];g.save();g.beginPath();g.arc(cx,cy,R,0,7);g.closePath();g.fillStyle='#fff';g.fill();g.clip();g.drawImage(orig,px-r,py-r,2*r,2*r,cx-R,cy-R,2*R,2*R);g.restore();g.beginPath();g.arc(cx,cy,R,0,7);g.lineWidth=9;g.strokeStyle=borde;g.stroke();g.lineWidth=3;g.strokeStyle='#fff';g.beginPath();g.arc(cx,cy,R-7,0,7);g.stroke()}
function corazon(g,x,y,s,c){g.save();g.translate(x,y);g.scale(s/30,s/30);g.beginPath();g.moveTo(0,8);g.bezierCurveTo(-18,-6,-8,-20,0,-9);g.bezierCurveTo(8,-20,18,-6,0,8);g.fillStyle=c;g.fill();g.restore()}
function bokeh(g,W,H,cols,n=40){for(let i=0;i<n;i++){g.beginPath();g.arc(Math.random()*W,Math.random()*H,8+Math.random()*50,0,7);g.fillStyle=cols[i%cols.length];g.globalAlpha=.08+Math.random()*.15;g.fill()}g.globalAlpha=1}
const precioTxt=p=>(p=String(p||'').replace(/\D/g,''))?'₡'+p.replace(/\B(?=(\d{3})+(?!\d))/g,'.'):'';
const BEN=[['💗','Luce linda'],['🤲','Hecho a mano'],['🎁','Perfecto para regalar']];
function chicle(d){const W=1080,H=1620;afc.width=W;afc.height=H;const g=ag;
 let gr=g.createLinearGradient(0,0,0,H);gr.addColorStop(0,'#fff5fa');gr.addColorStop(1,'#fde6f1');g.fillStyle=gr;g.fillRect(0,0,W,H);bokeh(g,W,H,['#ff9cc8','#c9a8ff','#ffd27a','#9ee6c8']);
 // título
 g.save();g.shadowColor='#e7a4c766';g.shadowBlur=20;pill(g,40,40,640,420,'#fde3ef');g.restore();g.lineWidth=6;g.strokeStyle='#fff';g.beginPath();g.roundRect(40,40,640,420,60);g.stroke();
 g.font=fit(g,d.tit,560,150,{f:'Fredoka'},50);d.tit=corto(g,d.tit,600);g.textAlign='center';g.textBaseline='middle';g.lineWidth=14;g.strokeStyle='#fff';g.strokeText(d.tit,360,150);g.fillStyle='#9b5fd0';g.fillText(d.tit,360,150);
 g.font=fit(g,d.sub,580,96,{f:'Fredoka'},40);d.sub=corto(g,d.sub,600);g.strokeText(d.sub,360,275);g.fillStyle='#e8478f';g.fillText(d.sub,360,275);
 pill(g,70,345,580,80,'#b48cff');texto(g,d.frase,360,385,540,40,'600 34px Fredoka','#fff','center');corazon(g,690,70,40,'#ff6fae');corazon(g,615,195,30,'#ff8fc0');
 // joya
 ajoya(g,40,480,640,720);
 // columna derecha
 const cx=880,Rb=150,bc='#f39bc5';burbuja(g,0,cx,215,Rb,bc);pill(g,720,375,330,90,'#ff7fb5');texto(g,d.d1,885,420,300,34,'700 30px Fredoka','#fff','center');
 const pc=['#ffd6e7','#e6d9ff','#d5f5e8','#fff1c4','#d9ecff'],ic=['#ff7fb5','#a77bf0','#5cc9a0','#f2c14e','#6aa6e8'];
 const fs=d.feats.filter(f=>norm(f)!==norm(d.d1)&&norm(f)!==norm(d.d2));for(const x of ['Hecho a mano en Costa Rica','Ideal para regalar'])if(fs.length<4&&!fs.includes(x))fs.push(x);fs.length=Math.min(fs.length,4);fs.forEach((f,i)=>{const y=510+i*120;pill(g,700,y,360,100,pc[i]);g.beginPath();g.arc(752,y+50,40,0,7);g.fillStyle=ic[i];g.fill();texto(g,icono(f,i),752,y+52,60,30,'40px sans-serif','#fff','center');texto(g,f,808,y+50,240,30,'600 27px Quicksand','#4a3550','left')});
 burbuja(g,1,cx,1120,Rb,bc);pill(g,720,1280,330,90,'#ff7fb5');texto(g,d.d2,885,1325,300,34,'700 30px Fredoka','#fff','center');
 // precio
 if(d.precio){g.save();g.translate(250,1395);g.rotate(-.05);pill(g,-170,-60,340,120,'#e8478f','#fff');texto(g,precioTxt(d.precio),0,4,320,60,'700 70px Fredoka','#fff','center');g.restore()}
 // barra beneficios
 pill(g,20,1480,1040,120,'#fff');g.fillStyle='#ffd6e7';g.beginPath();g.roundRect(20,1480,1040,120,40);g.fill();
 BEN.forEach(([e,t],i)=>{const x=190+i*350;texto(g,e,x,1515,80,40,'44px sans-serif','#000','center');texto(g,t,x,1567,330,30,'600 30px Quicksand','#5a3a60','center')})}
function elegante(d){const W=1080,H=1080;afc.width=W;afc.height=H;const g=ag;
 let gr=g.createRadialGradient(400,500,50,540,540,900);gr.addColorStop(0,'#fff3f6');gr.addColorStop(1,'#f3c9d5');g.fillStyle=gr;g.fillRect(0,0,W,H);bokeh(g,W,H,['#ffffff','#f7a8c0','#e9b97a'],50);
 for(let i=0;i<14;i++)flor(g,Math.random()<.5?Math.random()*140:W-Math.random()*120,Math.random()*H,10+Math.random()*16);
 // titulo
 g.font=fit(g,d.tit,620,170,{w:400,f:'"Great Vibes"'},60);d.tit=corto(g,d.tit,660);g.textAlign='center';g.textBaseline='alphabetic';const go=g.createLinearGradient(0,40,0,200);go.addColorStop(0,'#d9a956');go.addColorStop(1,'#a87428');g.fillStyle=go;g.fillText(d.tit,400,175);
 g.font=fit(g,d.sub,640,46,{w:600,f:'"Playfair Display"'},30);d.sub=corto(g,d.sub,660);g.fillStyle='#8a4a62';g.fillText(d.sub,420,240);
 pill(g,140,272,560,76,'#fbe1ea');texto(g,d.frase,420,310,520,34,'italic 500 30px "Playfair Display"','#7a4258','center');
 // pedestal octagonal
 g.save();g.shadowColor='#b0607a55';g.shadowBlur=40;g.shadowOffsetY=20;const px=70,py=380,pw=580,ph=600,c=90;g.beginPath();g.moveTo(px+c,py);g.lineTo(px+pw-c,py);g.lineTo(px+pw,py+c);g.lineTo(px+pw,py+ph-c);g.lineTo(px+pw-c,py+ph);g.lineTo(px+c,py+ph);g.lineTo(px,py+ph-c);g.lineTo(px,py+c);g.closePath();
 const pg=g.createLinearGradient(px,py,px+pw,py+ph);pg.addColorStop(0,'#f7c6d3');pg.addColorStop(1,'#e8a3b6');g.fillStyle=pg;g.fill();g.restore();
 ajoya(g,px+40,py+40,pw-80,ph-80,.4);
 // derecha: burbujas + badges
 const bc='#d98aa4';burbuja(g,0,900,200,135,bc);pill(g,750,345,300,84,'#fff8');texto(g,d.d1,900,387,280,30,'italic 600 26px "Playfair Display"','#7a4258','center');
 const fs=sinDup(d,3);fs.forEach((f,i)=>{const y=470+i*115;g.beginPath();g.arc(760,y,46,0,7);g.fillStyle='#fde4ec';g.fill();g.lineWidth=3;g.strokeStyle='#d98aa4';g.stroke();texto(g,icono(f,i),760,y+2,60,30,'40px sans-serif','#000','center');texto(g,f,935,y,250,30,'italic 600 26px "Playfair Display"','#6a3a50','center')});
 burbuja(g,1,900,880,120,bc);pill(g,780,1010,240,56,'#fff8');texto(g,d.d2,900,1038,230,26,'italic 600 24px "Playfair Display"','#7a4258','center');
 if(d.precio){g.save();g.shadowColor='#7a3a5266';g.shadowBlur=20;pill(g,380,900,330,130,'#b8607e');g.restore();g.lineWidth=4;g.strokeStyle='#fff';g.beginPath();g.roundRect(390,910,310,110,55);g.stroke();texto(g,precioTxt(d.precio),545,968,290,60,'600 68px "Playfair Display"','#fff','center')}}
function flor(g,x,y,r){g.save();g.translate(x,y);for(let i=0;i<5;i++){g.rotate(Math.PI*2/5);g.beginPath();g.ellipse(0,r*.7,r*.45,r*.7,0,0,7);g.fillStyle='#f7b6c8';g.globalAlpha=.85;g.fill()}g.globalAlpha=1;g.beginPath();g.arc(0,0,r*.3,0,7);g.fillStyle='#f5d77a';g.fill();g.restore()}
function tienda(d){const W=1080,H=1350;afc.width=W;afc.height=H;const g=ag;g.fillStyle='#ffffff';g.fillRect(0,0,W,H);
 g.fillStyle='#faf6f8';g.beginPath();g.roundRect(60,230,960,850,40);g.fill();
 const tt=d.tit+' '+d.sub.charAt(0).toLowerCase()+d.sub.slice(1);g.font=fit(g,tt,960,84,{w:600,f:'"Playfair Display"'},40);const tt2=corto(g,tt,980);g.textAlign='center';g.textBaseline='middle';g.fillStyle='#3a2a35';g.fillText(tt2,540,110);
 texto(g,d.frase,540,180,900,36,'500 32px Quicksand','#b0608a','center');ajoya(g,100,260,880,780,.25);
 burbuja(g,0,190,960,100,'#e6c3d4');burbuja(g,1,890,960,100,'#e6c3d4');
 const fs=sinDup(d,3,['Hecho a mano']);let x=60,y=1110;g.font='600 28px Quicksand';fs.forEach((f,i)=>{if(y>1170)return;const t=icono(f,i)+' '+f;const w=Math.min(470,g.measureText(t).width+60);if(x+w>1020){x=60;y+=90}if(y>1170)return;pill(g,x,y,w,70,'#fdeef5');texto(g,t,x+w/2,y+36,w-30,30,'600 28px Quicksand','#5a3a50','center');x+=w+20});
 g.fillStyle='#3a2a35';g.fillRect(0,1240,W,110);if(d.precio)texto(g,precioTxt(d.precio),200,1295,320,50,'700 60px Fredoka','#fff','center');
 texto(g,'🤲 Hecho a mano · 🎁 Para regalar',d.precio?700:540,1295,620,30,'600 30px Quicksand','#ffd6e7','center')}
function sinDup(d,n,extra=['Hecho a mano en Costa Rica','Ideal para regalar']){const fs=d.feats.filter(f=>norm(f)!==norm(d.d1)&&norm(f)!==norm(d.d2));for(const x of extra)if(fs.length<n&&!fs.includes(x))fs.push(x);return fs.slice(0,n)}
function afiche(){const d=deCampos();if(!d.feats.length)d.feats=['Hecho a mano'];({chicle,elegante,tienda})[plant](d)}
const afBlob=t=>new Promise(r=>afc.toBlob(r,t,.92));
async function afBajar(t,ext){const b=await afBlob(t);const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='afiche-'+Date.now()+'.'+ext;a.click();msg('✅ Afiche guardado en Descargas')}
$('afPng').onclick=()=>afBajar('image/png','png');$('afJpg').onclick=()=>afBajar('image/jpeg','jpg');
$('afShare').onclick=async()=>{const b=await afBlob('image/jpeg');const f=new File([b],'afiche.jpg',{type:'image/jpeg'});if(navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f],title:'Mi afiche'})}catch(e){}}else afBajar('image/jpeg','jpg')};

const fin=e=>{dedos.delete(e.pointerId);const a=[...dedos.values()];ini=a.length?{pos:{...pos},a,d:0}:null};
cv.addEventListener('pointerup',fin);cv.addEventListener('pointercancel',fin);
// exportar
const blob=t=>new Promise(r=>cv.toBlob(r,t,.92));
async function bajar(t,ext){const b=await blob(t);const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='joya-'+Date.now()+'.'+ext;a.click();msg('✅ Foto guardada en Descargas')}
$('png').onclick=()=>bajar('image/png','png');$('jpg').onclick=()=>bajar('image/jpeg','jpg');
$('compartir').onclick=async()=>{const b=await blob('image/jpeg');const f=new File([b],'joya.jpg',{type:'image/jpeg'});
 if(navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f],title:'Mi joya'})}catch(e){}}else bajar('image/jpeg','jpg')};

api.abrir=(file,texto)=>{const t=norm(texto||'');['auto','af','elegir','editor'].forEach(i=>$(i).style.display='none');cv.style.display='none';$('afRes').style.display='none';$('modos').style.display='none';msg('');
 if(/afiche|poster|anuncio|publicidad|para (publicar|redes)/.test(t)){afFile=file;$('afPrev').innerHTML=`<img src="${URL.createObjectURL(file)}" style="max-width:60%;max-height:160px;border-radius:12px">`;
  $('afTexto').value=(texto||'').replace(/^\s*(por favor\s*)?(hazme|haceme|haz|hace|creame|crea|arma|armame|quiero)?\s*(un|el|mi)?\s*(afiche|p[oó]ster|anuncio)\s*(de venta)?\s*(de|para|con)?\s*(est[ae]|mi)?\s*(foto)?[:,.\s]*/i,'');$('af').style.display='block';$('afHacer').click();return 'afiche'}
 if(/a mano|yo misma|manual/.test(t)){$('elegir').style.display='block';procesar(file,false);return 'mano'}
 aFile=file;$('aPrev').innerHTML=`<img src="${URL.createObjectURL(file)}" style="max-width:60%;max-height:160px;border-radius:12px">`;$('aTexto').value=texto||'';$('aTexto').oninput();$('auto').style.display='block';$('aHacer').click();return 'auto'};
api.inicio=()=>$('inicio').click();
}
export function abrirFotos(file,texto){initFotos();return api.abrir(file,texto)}
