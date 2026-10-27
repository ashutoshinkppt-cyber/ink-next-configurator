import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { ArrowRight, Check, ChevronRight, DoorOpen, Lightbulb, Menu, RotateCcw, X, Layers3, CirclePower, Settings2, CarFront, Car, ArrowUp, Gauge, Sun, SunMoon } from 'lucide-react';
import { CarScene } from './components/CarScene';
import { doorPivotMap, interiors, paints, type Quality, type View } from './config';

type Tab = 'exterior' | 'interior';
const OFF = {FL:false,FR:false,RL:false,RR:false};
const ALL = {FL:true,FR:true,RL:true,RR:true};
const cameraOptions: {name:string;view:View;subtitle:string}[] = [
 {name:'FRONT',view:'front',subtitle:'Front view'},
 {name:'SIDE',view:'side',subtitle:'Profile view'},
 {name:'REAR',view:'rear',subtitle:'Rear view'},
 {name:'TOP',view:'top',subtitle:'Top view'}
];
const paintIds = [3,2,0,4,1,6,7,5];
const displayPaints = paintIds.map(id=>paints[id]);
const displayInteriors = [
 {name:'Garnet',color:'#782e32',index:3},
 {name:'Cognac',color:'#936647',index:2},
 {name:'Ivory',color:'#dbd4c7',index:0},
 {name:'Graphite',color:'#383b3c',index:1}
];
function App(){
 const [tab,setTab] = useState<Tab>('exterior');
 const [paintIndex,setPaintIndex] = useState(3);
 const [paintUi,setPaintUi] = useState(0);
 const [interiorIndex,setInteriorIndex] = useState(2);
 const [seatUi,setSeatUi] = useState(1);
 const [view,setView] = useState<View>('hero');
 const [quality,setQuality] = useState<Quality>('low');
 const [paused,setPaused] = useState(false);
 const [allow3d,setAllow3d] = useState(false);
 const [safeMode,setSafeMode] = useState(true);
 const [tabHidden,setTabHidden] = useState(typeof document!=='undefined'?document.hidden:false);
 useEffect(()=>{const update=()=>setTabHidden(document.hidden);document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update)},[]);
 const [doors,setDoors] = useState<Record<string,boolean>>(OFF);
 const [wheels,setWheels] = useState<Record<string,boolean>>(OFF);
 const [headlights,setHeadlights] = useState(false);
 const [taillights,setTaillights] = useState(false);
 const [ready,setReady] = useState(false);
 const [mobileOpen,setMobileOpen] = useState(false);
 const [toolsOpen,setToolsOpen] = useState<'doors'|null>(null);
 const [qualityOpen,setQualityOpen] = useState(false);
 const [debugPaint] = useState(false);
 const onReady = useCallback(()=>setReady(true),[]);
 function changeView(next: View) {setView(next); if(next==='xray'){setDoors({...OFF});setTab('interior')} setMobileOpen(false);}
 function setLights(mode:'off'|'front'|'rear'|'all') {setHeadlights(mode==='front'||mode==='all');setTaillights(mode==='rear'||mode==='all');}
 function setPaintChoice(i:number){setPaintUi(i);setPaintIndex(paintIds[i])}
 function setSeatChoice(i:number){setSeatUi(i);setInteriorIndex(displayInteriors[i].index)}
 function share(){const link=window.location.href.split('#')[0]+'#build='+encodeURIComponent(JSON.stringify({paint:paintIndex,interior:interiorIndex,view}));navigator.clipboard?.writeText(link).then(()=>alert('Build link copied')).catch(()=>window.prompt('Copy configuration URL',link));}
 useEffect(()=>{const hash=window.location.hash; if(!hash.startsWith('#build='))return;try{const d=JSON.parse(decodeURIComponent(hash.slice(7)));if(Number.isInteger(d.paint)&&d.paint>=0&&d.paint<paints.length){setPaintIndex(d.paint);setPaintUi(Math.max(0,paintIds.indexOf(d.paint)))}if(Number.isInteger(d.interior)&&d.interior>=0&&d.interior<interiors.length){setInteriorIndex(d.interior);setSeatUi(Math.max(0,displayInteriors.findIndex(p=>p.index===d.interior)))}if(['hero','front','side','rear','top','interior','xray'].includes(d.view))setView(d.view)}catch{}},[]);
 const lightMode = headlights && taillights ? 'all' : headlights?'front':taillights?'rear':'off';
 const rotating = Object.values(wheels).some(Boolean);
 return <div className="ink-app">
  <header className="topbar">
   <button className="brand" onClick={()=>changeView('hero')}><strong>INK NEXT</strong><span>CREATIVE STUDIO<br/>FOR A VISUAL WORLD</span></button>
   <nav className="topnav" aria-label="Main navigation"><button onClick={()=>changeView('hero')}>WORK</button><button onClick={()=>setTab('exterior')}>SERVICES</button><button onClick={()=>setQualityOpen(v=>!v)}>ABOUT</button><button onClick={share}>CAREERS</button><button onClick={share}>CONTACT</button></nav>
   <div className="topright"><span>LET’S CREATE<br/>WHAT’S NEXT</span><button className="circle-arrow" onClick={share} title="Share build"><ArrowRight size={22}/></button><button className="mobile-toggle" onClick={()=>setMobileOpen(v=>!v)} aria-label="Open menu"><Menu/></button></div>
  </header>
  {mobileOpen&&<div className="mobile-drawer"><button onClick={()=>setTab('exterior')}>EXTERIOR</button><button onClick={()=>setTab('interior')}>INTERIOR</button><button onClick={()=>changeView('xray')}>X-RAY</button><button onClick={share}>SHARE BUILD</button></div>}
  <main className="showroom">
   <div className="scene-underlay" aria-hidden="true"><div className="studio-wall"/><div className="ceiling-architecture"/><div className="ceiling-oculus"/><div className="ceiling-rim"/><div className="light-ring"/><div className="back-light left"/><div className="back-light right"/><div className="studio-floor"/><div className="floor-orbit"/></div>
   {allow3d && <div className="model-canvas"><CarScene paused={paused||tabHidden} paintIndex={paintIndex} interiorIndex={interiorIndex} view={view} quality={safeMode?'low':quality} openDoors={doors} spinningWheels={wheels} headlights={headlights} taillights={taillights} debugPaint={debugPaint} onReady={onReady}/></div>}
   {!allow3d && <div className="safe-preview"><div className="safe-preview-copy"><span className="safe-kicker">INK NEXT / SAFE STUDIO</span><h2>Luxury in every detail.</h2><p>Studio preview is ready. The high-detail vehicle is deliberately not loaded to protect your device.</p><div className="safe-actions"><button className="safe-primary" onClick={()=>{setQuality('low');setSafeMode(true);setWheels({...OFF});setAllow3d(true);setReady(false)}}>LOAD 3D MODEL — LOW MODE</button><span>Only enable after investigating the previous display failures.</span></div></div></div>}
   {allow3d&&!ready&&<div className="loading-tip">LOADING YOUR 3D CAR EXPERIENCE…</div>}
   <aside className="settings-panel">
    <div className="ivory-panel-head"><strong>CONFIGURE</strong><span>{tab.toUpperCase()}</span></div>
    <div className="mode-tabs"><button className={tab==='exterior'?'active':''} onClick={()=>setTab('exterior')}>EXTERIOR</button><button className={tab==='interior'?'active':''} onClick={()=>{setTab('interior');changeView('xray')}}>INTERIOR</button></div>
    <div className="settings-scroll">
     <div className="setting-title"><span>◉ &nbsp; BODY COLOR</span><ChevronRight size={18}/></div><p className="setting-subtitle">Metallic</p>
     <div className="color-grid">{displayPaints.map((p,i)=><button key={i} className={`color-dot ${paintUi===i?'selected':''}`} title={p.name} aria-label={`Select ${p.name}`} aria-pressed={paintUi===i} onClick={()=>setPaintChoice(i)} style={{'--swatch':p.color} as CSSProperties}/>)}</div>
     <div className="panel-rule"/>
     <div className="setting-title"><span>♧ &nbsp; SEAT COLOR</span><ChevronRight size={18}/></div><p className="setting-subtitle">Leather</p>
     <div className="color-grid seat-grid">{displayInteriors.map((p,i)=><button key={i} className={`color-dot ${seatUi===i?'selected':''}`} title={p.name} aria-label={`Select ${p.name} seat color`} aria-pressed={seatUi===i} onClick={()=>setSeatChoice(i)} style={{'--swatch':p.color} as CSSProperties}/>)}</div>
     <div className="panel-rule"/>
     <div className="setting-title">☼ &nbsp; LIGHTS</div>
     <div className="light-grid">{([{id:'off',label:'OFF'},{id:'front',label:'HEADLIGHTS'},{id:'rear',label:'TAIL LIGHTS'},{id:'all',label:'ALL LIGHTS'}] as const).map(x=><button key={x.id} className={`light-card ${lightMode===x.id?'active':''}`} onClick={()=>setLights(x.id)} aria-pressed={lightMode===x.id}><span className={`light-symbol ${x.id}`}>{x.id==='off'?<SunMoon size={25}/>:x.id==='rear'?<Car size={27}/>:x.id==='all'?<Sun size={25}/>:<CarFront size={27}/> }</span><small>{x.label}</small></button>)}</div>
     <div className="panel-rule"/>
     <h3 className="panel-feature-title">VEHICLE FEATURES</h3>
   <aside className="side-tools" aria-label="Vehicle actions">
    <button className={view==='xray'?'selected':''} onClick={()=>changeView(view==='xray'?'hero':'xray')}><Layers3 size={29}/><span>X-RAY</span></button>
    <button className={toolsOpen==='doors'?'selected':''} onClick={()=>setToolsOpen(s=>s==='doors'?null:'doors')}><DoorOpen size={27}/><span>DOORS</span></button>
    <button className={rotating?'selected':''} onClick={()=>setWheels(rotating?{...OFF}:{...ALL})}><RotateCcw size={28}/><span>WHEEL<br/>ROTATION</span><span className={`mini-switch ${rotating?'on':''}`}><i/></span></button>
   </aside>
   {toolsOpen==='doors'&&<div className="tools-popover"><div className="tools-heading"><strong>DOOR CONTROLS</strong><button onClick={()=>setToolsOpen(null)} aria-label="Close"><X size={18}/></button></div><div className="door-grid">{Object.keys(doorPivotMap).map(key=><button key={key} className={doors[key]?'active':''} onClick={()=>setDoors(d=>({...d,[key]:!d[key]}))}>{({FL:'FRONT LEFT',FR:'FRONT RIGHT',RL:'REAR LEFT',RR:'REAR RIGHT'} as Record<string,string>)[key]} <span>{doors[key]?'OPEN':'CLOSED'}</span></button>)}</div><button className="tool-reset" onClick={()=>setDoors({...OFF})}>CLOSE ALL DOORS</button></div>}

   <div className={`quality-dropdown ${qualityOpen?'expanded':''}`}>
    <button className="quality-trigger" onClick={()=>setQualityOpen(v=>!v)} aria-expanded={qualityOpen} aria-controls="quality-options"><Gauge size={17}/><span>RENDER QUALITY</span><strong>{quality.toUpperCase()}</strong><ChevronRight className={qualityOpen?'rotated':''} size={17}/></button>
    {qualityOpen&&<div id="quality-options" className="quality-menu">{(['low','balanced','high'] as Quality[]).map(q=><button key={q} className={quality===q?'active':''} onClick={()=>{setQuality(q);setSafeMode(q==='low');setQualityOpen(false)}}>{q==='balanced'?'BALANCED':q.toUpperCase()}{quality===q&&<Check size={14}/>}</button>)}<p>Higher settings may increase GPU load.</p></div>}
   </div>
    </div>
   </aside>
   <div className="bottom-cameras">{cameraOptions.map((item,i)=><button key={item.view} className={`camera-card ${view===item.view?'active':''}`} onClick={()=>changeView(item.view)}><span className={`camera-icon camera-${i}`}>{i===0?<CarFront className="camera-vector" size={37}/>:i===1?<Car className="camera-vector" size={40}/>:i===2?<CarFront className="camera-vector rear-vector" size={37}/>:<ArrowUp className="camera-vector" size={32}/>}</span><span className="camera-label">{item.name}</span></button>)}</div>
   <div className="scroll-invite"><span>↓</span><span>SCROLL<br/>TO EXPLORE</span></div>
   <button className="pause-render" onClick={()=>{if(allow3d){setAllow3d(false);setWheels({...OFF});setPaused(false);setReady(false)}else{setQuality('low');setSafeMode(true);setAllow3d(true)}}}>{allow3d?'UNLOAD 3D (SAFE)':'LOAD 3D'}</button>
   {paused&&<div className="pause-label">3D PAUSED — SELECT RESUME TO CONTINUE</div>}
   <button className="reset-camera" onClick={()=>changeView('hero')}><RotateCcw size={14}/> RESET VIEW</button>
  </main>
  <footer className="mobile-footer"><span>INK AUTOMOTIVE CONFIGURATOR</span><button onClick={share}>SHARE BUILD <ArrowRight size={15}/></button></footer>
 </div>;
}
export default App;
