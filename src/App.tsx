import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, ChevronRight, DoorOpen, Menu, RotateCcw, X, Layers3, CarFront, Car, ArrowUp, Gauge, Palette, Armchair, Mail, CheckCircle2, AlertCircle, RotateCw, Phone, MapPin, ExternalLink } from 'lucide-react';
// Load the substantial Three.js/R3F viewer code only after the visitor chooses 3D.
const LazyCarScene = lazy(() => import('./components/CarScene').then(module => ({ default: module.CarScene })));
const preload3DCode = () => { void import('./components/CarScene'); };
import { doorPivotMap, interiors, paints, type Quality, type View } from './config';
import { STUDIO_CONTACT_EMAIL, STUDIO_CONTACT_PHONE, STUDIO_ADDRESS, STUDIO_WEBSITE, STUDIO_BEHANCE, STUDIO_VIMEO } from './siteSettings';

// Keeps the rest of the configurator alive if WebGL throws during initialization.
class WebGLErrorBoundary extends Component<{children:ReactNode;onError:(error:Error)=>void},{failed:boolean}> {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(error:Error){this.props.onError(error);}
 render(){return this.state.failed?null:this.props.children;}
}

type Tab = 'exterior' | 'interior';
type NavPage = 'services' | 'about' | 'contact';
const NAV_PAGES = ['services','about','contact'] as const;

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
 const settingsScrollRef=useRef<HTMLDivElement>(null);
 const [paintIndex,setPaintIndex] = useState(3);
 const [paintUi,setPaintUi] = useState(0);
 const [interiorIndex,setInteriorIndex] = useState(2);
 const [seatUi,setSeatUi] = useState(1);
 const [view,setView] = useState<View>('hero');
 const [quality,setQuality] = useState<Quality>('low');
 const [paused,setPaused] = useState(false);
 const [allow3d,setAllow3d] = useState(false);
 const [tabHidden,setTabHidden] = useState(typeof document!=='undefined'?document.hidden:false);
 const [doors,setDoors] = useState<Record<string,boolean>>(OFF);
 const [wheels,setWheels] = useState<Record<string,boolean>>(OFF);
 const [ready,setReady] = useState(false);
 const [mobileOpen,setMobileOpen] = useState(false);
 const [navPage,setNavPage] = useState<NavPage|null>(null);
 const navCloseRef = useRef<HTMLButtonElement>(null);
 const [contactName,setContactName] = useState('');
 const [contactFrom,setContactFrom] = useState('');
 const [contactBody,setContactBody] = useState('');
 const [contactService,setContactService] = useState('3D Product Animation');
 const [contactStatus,setContactStatus] = useState('');
 const [contactStatusKind,setContactStatusKind] = useState<'success'|'error'|'info'>('info');
 const [contactSubmitting,setContactSubmitting] = useState(false);
 const [contactConsent,setContactConsent] = useState(false);
 const [contactWebsite,setContactWebsite] = useState('');
 const navContentRef = useRef<HTMLDivElement>(null);
 const [shareNotice,setShareNotice] = useState('');
 const [webglError,setWebglError] = useState('');
 const [toolsOpen,setToolsOpen] = useState<'doors'|null>(null);
 const [qualityOpen,setQualityOpen] = useState(false);
 const [panelExpanded,setPanelExpanded] = useState(false);
 const [debugPaint] = useState(false);
 const navItems=['SERVICES','ABOUT','CONTACT'] as const;
 const onReady = useCallback(()=>setReady(true),[]);
 const handleGraphicsFailure = useCallback(()=>{
   setWebglError('The 3D graphics session ended unexpectedly. The viewer has been closed; the rest of the website is still available.');
   setAllow3d(false);
   setReady(false);
   setWheels({...OFF});
   setQuality('low');
   setPaused(false);
 },[]);
 const handleModelError = useCallback((error:Error)=>{
   console.error('INK NEXT WebGL initialization error:',error);
   handleGraphicsFailure();
 },[handleGraphicsFailure]);
 
 useEffect(()=>{const update=()=>setTabHidden(document.hidden);document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update)},[]);
 
 function selectTab(next:Tab){
  setTab(next);
  setMobileOpen(false);
  setToolsOpen(null);
  setQualityOpen(false);
  if(view==='xray')setView('hero');
  settingsScrollRef.current?.scrollTo({top:0,behavior:'auto'});
 }
 function changeView(next: View) {
  setView(next);
  if(next==='xray')setDoors({...OFF});
  setMobileOpen(false);
 }
 function setPaintChoice(i:number){setPaintUi(i);setPaintIndex(paintIds[i])}
 function setSeatChoice(i:number){setSeatUi(i);setInteriorIndex(displayInteriors[i].index)}
 // Hash-based sections work on Vite/Vercel without requiring new routes.
 // Browser back/forward and direct URLs like /#about work as expected.
 useEffect(()=>{
  const sync=()=>{
   const h=window.location.hash.slice(1).toLowerCase();
   setNavPage(NAV_PAGES.includes(h as NavPage) ? h as NavPage : null);
  };
  sync();
  window.addEventListener('hashchange',sync);
  return ()=>window.removeEventListener('hashchange',sync);
 },[]);
 useEffect(()=>{
  if(!navPage)return;
  setMobileOpen(false);
  const prev=document.body.style.overflow;
  document.body.style.overflow='hidden';
  navCloseRef.current?.focus();
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')closeStudioPage()};
  window.addEventListener('keydown',onKey);
  return ()=>{document.body.style.overflow=prev;window.removeEventListener('keydown',onKey)};
 },[navPage]);
 // Each sheet starts at its heading, even if a previous tab was scrolled.
 useEffect(()=>{navContentRef.current?.scrollTo({top:0,behavior:'auto'});},[navPage]);
 function closeStudioPage(){
  if(NAV_PAGES.includes(window.location.hash.slice(1).toLowerCase() as NavPage)){
   history.replaceState(null,'',window.location.pathname+window.location.search);
  }
  setNavPage(null);
 }
 function openStudioPage(page:NavPage){
  setMobileOpen(false);
  setNavPage(page);
  window.location.hash=page;
 }
 function openFeature(next:Tab, perspective:View){
  closeStudioPage();
  selectTab(next);
  changeView(perspective);
  if(window.innerWidth<=600)setPanelExpanded(true);
 }
 function resetContact(){
  if(contactSubmitting)return;
  setContactName('');
  setContactFrom('');
  setContactBody('');
  setContactService('3D Product Animation');
  setContactConsent(false);
  setContactWebsite('');
  setContactStatus('');
  setContactStatusKind('info');
 }
 async function submitContact(){
  if(contactSubmitting)return;
  const name=contactName.trim();
  const email=contactFrom.trim();
  const message=contactBody.trim();
  // Native required and type=email checks remain active in the form.
  if(!name || !message || !email || !contactConsent){
   setContactStatusKind('error');
   setContactStatus('Complete your name, valid email, project details and consent before submitting.');
   return;
  }
  if(contactWebsite){ // Invisible anti-bot field: silently reject automated submissions.
   setContactStatusKind('error');
   setContactStatus('Could not submit this inquiry.');
   return;
  }
  setContactSubmitting(true);
  setContactStatus('');
  const controller=new AbortController();
  const timeout=window.setTimeout(()=>controller.abort(),18000);
  try{
   // FormSubmit is a third-party form delivery service, not an in-house endpoint.
   // Studio must complete their one-time activation at sales@ink-next.com.
   const response=await fetch(`https://formsubmit.co/ajax/${STUDIO_CONTACT_EMAIL}`,{
    method:'POST',
    headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify({
     name,email,
     service:contactService,
     message,
     _subject:`INK NEXT website inquiry — ${contactService}`,
     _replyto:email,
     _template:'table',
     _captcha:'false',
     _honey:contactWebsite,
     source:'INK NEXT automotive configurator',
    }),
    signal:controller.signal,
   });
   const result=await response.json() as {success?:boolean|string;message?:string};
   // Do not treat HTTP 200 or the string "false" as a successful submission.
   if(!response.ok || !(result.success===true || result.success==='true')){
    throw new Error(result.message || 'The form service did not accept your request.');
   }
   setContactStatusKind('success');
   setContactStatus('Your inquiry was accepted by the form service. Delivery to INK NEXT requires the studio to complete its one-time email activation.');
  }catch(error){
   const msg=error instanceof Error?error.message:'Unknown submission error';
   setContactStatusKind('error');
   setContactStatus(`Inquiry not confirmed: ${msg}. Please retry or email ${STUDIO_CONTACT_EMAIL} directly.`);
  }finally{
   window.clearTimeout(timeout);
   setContactSubmitting(false);
  }
 }

 function share(){
  const link=window.location.href.split('#')[0]+'#build='+encodeURIComponent(JSON.stringify({paint:paintIndex,interior:interiorIndex,view}));
  if(navigator.clipboard?.writeText){
   navigator.clipboard.writeText(link).then(()=>setShareNotice('Configuration link copied')).catch(()=>window.prompt('Copy configuration URL',link));
  }else window.prompt('Copy configuration URL',link);
 }
 useEffect(()=>{
  const hash=window.location.hash;
  if(!hash.startsWith('#build='))return;
  try{
   const d=JSON.parse(decodeURIComponent(hash.slice(7)));
   if(Number.isInteger(d.paint)&&d.paint>=0&&d.paint<paints.length){setPaintIndex(d.paint);setPaintUi(Math.max(0,paintIds.indexOf(d.paint)))}
   if(Number.isInteger(d.interior)&&d.interior<interiors.length){setInteriorIndex(d.interior);setSeatUi(Math.max(0,displayInteriors.findIndex(p=>p.index===d.interior)))}
   if(['hero','front','side','rear','top','interior','xray'].includes(d.view))setView(d.view);
  }catch{}
 },[]);
 const rotating = Object.values(wheels).some(Boolean);
 
 return <div className="ink-app">
  <header className="topbar">
   <button className="brand" aria-label="INK NEXT home view" onClick={()=>{closeStudioPage();changeView('hero')}}><strong>INK NEXT</strong><span>CREATIVE STUDIO<br/>FOR A VISUAL WORLD</span></button>
   <nav className="topnav" aria-label="Main navigation">{navItems.map(item=><a key={item} href={`#${item.toLowerCase()}`} aria-current={navPage===item.toLowerCase()?'page':undefined} onClick={()=>openStudioPage(item.toLowerCase() as NavPage)}>{item}</a>)}</nav>
   <div className="topright"><span>LET’S CREATE<br/>WHAT’S NEXT</span><button className="circle-arrow" onClick={share} title="Share your car configuration" aria-label="Share your car configuration"><ArrowRight size={22}/></button><button className="mobile-toggle" onClick={()=>setMobileOpen(v=>!v)} aria-controls="mobile-navigation" aria-label={mobileOpen?"Close navigation menu":"Open navigation menu"} aria-expanded={mobileOpen}>{mobileOpen?<X/>:<Menu/>}</button></div>
  </header>
  {mobileOpen&&<nav id="mobile-navigation" className="mobile-drawer" aria-label="Mobile navigation">{navItems.map(item=><a key={item} href={`#${item.toLowerCase()}`} onClick={()=>openStudioPage(item.toLowerCase() as NavPage)}>{item}</a>)}</nav>}
  {shareNotice&&<div className="nav-notice share-notice" role="status">{shareNotice}<button aria-label="Dismiss share notice" onClick={()=>setShareNotice('')}><X size={16}/></button></div>}

  {navPage&&<div className="studio-nav-overlay">
    <button className="studio-nav-backdrop" onClick={closeStudioPage} aria-label="Close section"/>
    <section className="studio-nav-sheet" role="dialog" aria-modal="true" aria-labelledby="studio-nav-heading" key={navPage}>
      <div className="studio-nav-sheet-top"><span>INK NEXT <span className="studio-nav-top-separator">/</span> {navPage.toUpperCase()}</span><button ref={navCloseRef} className="studio-nav-close" onClick={closeStudioPage} aria-label="Close panel"><X size={22}/></button></div>
      {navPage==='services'&&<div className="studio-nav-content">
        <span className="studio-nav-eyebrow">SERVICES / INTERACTIVE EXPERIENCES</span>
        <h2 id="studio-nav-heading">Explore the possibilities.</h2>
        <p>Discover what this interactive automotive experience can do. Select an area to jump directly to its controls.</p>
        <div className="studio-nav-services">
          <button onClick={()=>openFeature('exterior','hero')}><Palette size={28}/><strong>Exterior finishes</strong><span>Explore the available body colors.</span><ArrowRight size={17}/></button>
          <button onClick={()=>openFeature('interior','interior')}><Armchair size={28}/><strong>Interior materials</strong><span>See upholstery options and the cabin view.</span><ArrowRight size={17}/></button>
          <button onClick={()=>{closeStudioPage();changeView('xray')}}><Layers3 size={28}/><strong>Vehicle details</strong><span>Inspect the car through its X-ray camera.</span><ArrowRight size={17}/></button>
        </div>
        <p className="studio-nav-fineprint">The detailed 3D viewer remains optional and does not start automatically.</p>
      </div>}
      {navPage==='about'&&<div className="studio-nav-content studio-v35-about">
        <span className="studio-nav-eyebrow">ABOUT / THE CREATIVE STUDIO</span>
        <h2 id="studio-nav-heading">We bring products to life through visual storytelling.</h2>
        <p>INK NEXT is a creative animation studio building cinematic product visuals, motion-led stories and immersive assets for brands. We bring design, craft and production into one connected process, from the first brief to the final frame.</p>
        <div className="studio-v35-hero-line"><span>STRATEGY MEETS VISUAL CRAFT</span><span>3D / MOTION / IMMERSIVE</span></div>
        <div className="studio-v35-about-grid">
         <article className="studio-v35-intro"><span className="studio-v35-section-label">01 / OUR POINT OF VIEW</span><h3>Ideas deserve to be experienced.</h3><p>We use thoughtful storytelling, detailed design and technical precision to help people understand and connect with products—whether through a launch film, a realistic animation or an interactive experience.</p></article>
         <article className="studio-v35-discipline"><span className="studio-v35-section-label">02 / WHAT WE CREATE</span>
          <div><span>3D Product Animation</span><span>01</span></div>
          <div><span>2D Animation</span><span>02</span></div>
          <div><span>Motion Graphics</span><span>03</span></div>
          <div><span>AR/VR-Ready 3D Assets</span><span>04</span></div>
         </article>
        </div>
        <div className="studio-v35-process">
         <span className="studio-v35-section-label">03 / OUR PROCESS</span>
         <div className="studio-v35-process-grid">{[
          ['DISCOVER','Understand the product, audience and story.'],
          ['DESIGN','Define the look, storyboards and visual direction.'],
          ['DEVELOP','Build, texture, rig and animate the scenes.'],
          ['DRIVE','Render, grade and refine the finished work.'],
          ['DELIVER','Prepare final assets for every required platform.']
         ].map(([name,description],i)=><div key={name}><span>{String(i+1).padStart(2,'0')}</span><strong>{name}</strong><p>{description}</p></div>)}</div>
        </div>
        <div className="studio-v35-about-bottom"><div><span className="studio-v35-section-label">THE SECTORS WE SERVE</span><p>Automotive · Healthcare · FMCG · Technology · Electronics · Fashion · Cosmetics</p></div>
         <a href={STUDIO_WEBSITE} target="_blank" rel="noopener noreferrer" className="studio-nav-outline">EXPLORE INK NEXT <ExternalLink size={16}/></a>
        </div>
        <div className="studio-nav-actions"><button className="studio-nav-primary" onClick={()=>openStudioPage('contact')}>START A PROJECT <ArrowRight size={17}/></button><button className="studio-nav-outline" onClick={()=>{closeStudioPage();changeView('hero')}}>BACK TO SHOWROOM</button></div>
      </div>}
      {navPage==='contact'&&<div ref={navContentRef} className="studio-nav-content studio-nav-contact studio-v35-contact">
        <span className="studio-nav-eyebrow">CONTACT / LET'S COLLABORATE</span>
        <h2 id="studio-nav-heading">Let's bring your idea to life.</h2>
        <p>Have a product, launch or story in mind? Get in touch with our animation team and tell us what you're creating.</p>
        <div className="studio-v35-contact-grid">
          <div className="studio-v35-contact-details">
           <span className="studio-v35-section-label">REACH OUR STUDIO</span>
           <a className="studio-v35-detail" href={`mailto:${STUDIO_CONTACT_EMAIL}`}><Mail size={19}/><span><small>EMAIL US</small><strong>{STUDIO_CONTACT_EMAIL}</strong></span><ArrowRight size={17}/></a>
           <a className="studio-v35-detail" href={`tel:${STUDIO_CONTACT_PHONE.replace(/[^+\d]/g,'')}`}><Phone size={19}/><span><small>CALL US</small><strong>{STUDIO_CONTACT_PHONE}</strong></span><ArrowRight size={17}/></a>
           <div className="studio-v35-detail studio-v35-address"><MapPin size={19}/><span><small>VISIT US</small><strong>{STUDIO_ADDRESS}</strong></span></div>
           <div className="studio-v35-social"><span className="studio-v35-section-label">FOLLOW OUR WORK</span><div><a href={STUDIO_BEHANCE} target="_blank" rel="noopener noreferrer">BEHANCE <ExternalLink size={13}/></a><a href={STUDIO_VIMEO} target="_blank" rel="noopener noreferrer">VIMEO <ExternalLink size={13}/></a></div></div>
          </div>
          <form className="studio-v35-form" onSubmit={event=>{event.preventDefault();void submitContact()}}>
           <span className="studio-v35-section-label">TELL US ABOUT YOUR PROJECT</span>
           <div className="studio-nav-fields">
            <label>Your name *<input name="name" required autoComplete="name" value={contactName} onChange={e=>{setContactName(e.target.value);setContactStatus('')}} placeholder="Full name" minLength={2} maxLength={100}/></label>
            <label>Your email *<input name="email" required type="email" autoComplete="email" value={contactFrom} onChange={e=>{setContactFrom(e.target.value);setContactStatus('')}} placeholder="you@company.com" maxLength={180}/></label>
           </div>
           <label>Interested in<select name="service" value={contactService} onChange={e=>{setContactService(e.target.value);setContactStatus('')}}>
            <option>3D Product Animation</option>
            <option>3D Configurator</option>
            <option>2D Animation</option>
            <option>Motion Graphics</option>
            <option>AR/VR-Ready 3D Assets</option>
            <option>Something else</option>
           </select></label>
           <label>Project details *<textarea name="message" required minLength={10} value={contactBody} onChange={e=>{setContactBody(e.target.value);setContactStatus('')}} placeholder="Tell us about your project, timeline and goals…" maxLength={2500} rows={4}/></label>
           <div className="ink-v36-botfield" aria-hidden="true"><label>Website<input name="website" value={contactWebsite} onChange={e=>setContactWebsite(e.target.value)} tabIndex={-1} autoComplete="off"/></label></div>
           <label className="ink-v36-consent"><input type="checkbox" required checked={contactConsent} onChange={e=>{setContactConsent(e.target.checked);setContactStatus('')}}/><span>I agree to send my inquiry details to INK NEXT through the <a href="https://formsubmit.co/privacy.pdf" target="_blank" rel="noopener noreferrer">FormSubmit</a> delivery service.</span></label>
           <div className="studio-nav-actions ink-v36-form-actions">
            <button type="submit" className="studio-nav-primary" disabled={contactSubmitting}>{contactSubmitting?'SUBMITTING…':'SUBMIT INQUIRY'} <Mail size={17}/></button>
            <button type="button" className="studio-nav-outline" onClick={resetContact} disabled={contactSubmitting}>RESET FORM <RotateCw size={16}/></button>
           </div>
           {contactStatus&&<p className={`studio-nav-feedback ink-v36-status ink-v36-${contactStatusKind}`} role={contactStatusKind==='error'?'alert':'status'}>{contactStatusKind==='error'?<AlertCircle size={17}/>:<CheckCircle2 size={17}/>}<span>{contactStatus}</span></p>}
           <p className="studio-v35-form-note">Submits through FormSubmit to sales@ink-next.com. A one-time activation by INK NEXT is required before delivery works. You can also use the email link on the left.</p>
          </form>
        </div>
      </div>}
    </section>
   </div>}
  <main className="showroom">
   <div className="scene-underlay" aria-hidden="true"><div className="studio-wall"/><div className="ceiling-architecture"/><div className="ceiling-oculus"/><div className="ceiling-rim"/><div className="light-ring"/><div className="back-light left"/><div className="back-light right"/><div className="studio-floor"/><div className="floor-orbit"/></div>
   {allow3d && <div className="model-canvas"><WebGLErrorBoundary onError={handleModelError}><Suspense fallback={<div className="loading-tip" role="status">PREPARING 3D VIEWER…</div>}><LazyCarScene onContextLost={handleGraphicsFailure} paused={paused||tabHidden} paintIndex={paintIndex} interiorIndex={interiorIndex} view={view} quality={quality} openDoors={doors} spinningWheels={wheels} debugPaint={debugPaint} onReady={onReady}/></Suspense></WebGLErrorBoundary></div>}
   {!allow3d && <div className={`safe-preview ${webglError?'safe-preview-error':''}`}><div className="safe-preview-copy">
      <span className="safe-kicker">INK NEXT / AUTOMOTIVE EXPERIENCE</span>
      <h2>{webglError?'3D viewer paused.':'Designed to be explored.'}</h2>
      <p>{webglError?'Your device or browser stopped the WebGL graphics session. The rest of the configurator is available without 3D.':'Discover each finish and detail in our interactive automotive showroom.'}</p>
      {webglError ? <div className="safe-actions"><p role="alert" className="gpu-error">{webglError}</p><span>Do not restart 3D on the affected computer until its graphics fault is investigated.</span><button className="safe-secondary" onClick={()=>window.location.reload()}>RELOAD PAGE IN PREVIEW MODE</button></div>
       : <div className="safe-actions"><button className="safe-primary" onPointerEnter={preload3DCode} onFocus={preload3DCode} onClick={()=>{setWebglError('');setQuality('low');setWheels({...OFF});setAllow3d(true);setReady(false)}}>ENTER 3D SHOWROOM</button><span>Optional 3D · Low quality loads first.</span></div>}
    </div></div>}
   {allow3d&&!ready&&<div className="loading-tip" role="status">LOADING YOUR 3D CAR EXPERIENCE…</div>}
   <aside className={`settings-panel ${panelExpanded?"sheet-expanded":"sheet-peek"}`}>
    <div className="ivory-panel-head"><strong>CONFIGURE</strong><span>{tab.toUpperCase()}</span><button className="sheet-handle" onClick={()=>setPanelExpanded(v=>!v)} aria-expanded={panelExpanded} aria-label={panelExpanded?"Collapse configuration panel":"Expand configuration panel"}>{panelExpanded?"SHOW LESS":"CUSTOMIZE CAR"}<ChevronRight size={16}/></button></div>
    <div className="mode-tabs" role="group" aria-label="Configuration section"><button aria-pressed={tab==='exterior'} className={tab==='exterior'?'active':''} onClick={()=>selectTab('exterior')}>EXTERIOR</button><button className={tab==='interior'?'active':''} aria-pressed={tab==='interior'} onClick={()=>selectTab('interior')}>INTERIOR</button></div>
    <div className="settings-scroll" ref={settingsScrollRef}>
     {tab==='exterior'&&<><div className="setting-title"><span>◉ &nbsp; BODY COLOR</span><ChevronRight size={18}/></div><p className="setting-subtitle">{displayPaints[paintUi]?.name} · Metallic</p>
     <div className="color-grid">{displayPaints.map((p,i)=><button key={i} className={`color-dot ${paintUi===i?'selected':''}`} title={p.name} aria-label={`Select ${p.name}`} aria-pressed={paintUi===i} onClick={()=>setPaintChoice(i)} style={{'--swatch':p.color} as CSSProperties}/>)}</div>
     <div className="panel-rule"/></>}
     {tab==='interior'&&<><div className="setting-title"><span>♧ &nbsp; SEAT COLOR</span><ChevronRight size={18}/></div><p className="setting-subtitle">{displayInteriors[seatUi]?.name} · Leather</p>
     <div className="color-grid seat-grid">{displayInteriors.map((p,i)=><button key={i} className={`color-dot ${seatUi===i?'selected':''}`} title={p.name} aria-label={`Select ${p.name} seat color`} aria-pressed={seatUi===i} onClick={()=>setSeatChoice(i)} style={{'--swatch':p.color} as CSSProperties}/>)}</div>
     <div className="panel-rule"/></>}
     <h3 className="panel-feature-title">VEHICLE FEATURES</h3>
     <aside className="side-tools" aria-label="Vehicle actions">
      <button aria-pressed={view==='xray'} aria-label="Toggle X-ray view" className={view==='xray'?'selected':''} onClick={()=>changeView(view==='xray'?'hero':'xray')}><Layers3 size={29}/><span>X-RAY</span></button>
      <button aria-expanded={toolsOpen==='doors'} aria-label="Show door controls" className={toolsOpen==='doors'?'selected':''} onClick={()=>setToolsOpen(s=>s==='doors'?null:'doors')}><DoorOpen size={27}/><span>DOORS</span></button>
      <button aria-pressed={rotating} aria-label={rotating?"Stop wheel rotation":"Start wheel rotation"} className={rotating?'selected':''} onClick={()=>setWheels(rotating?{...OFF}:{...ALL})}><RotateCcw size={28}/><span>WHEEL<br/>ROTATION</span><span className={`mini-switch ${rotating?'on':''}`}><i/></span></button>
     </aside>
     {toolsOpen==='doors'&&<div className="tools-popover"><div className="tools-heading"><strong>DOOR CONTROLS</strong><button onClick={()=>setToolsOpen(null)} aria-label="Close"><X size={18}/></button></div><div className="door-grid">{Object.keys(doorPivotMap).map(key=><button key={key} className={doors[key]?'active':''} onClick={()=>setDoors(d=>({...d,[key]:!d[key]}))}>{({FL:'FRONT LEFT',FR:'FRONT RIGHT',RL:'REAR LEFT',RR:'REAR RIGHT'} as Record<string,string>)[key]} <span>{doors[key]?'OPEN':'CLOSED'}</span></button>)}</div><button className="tool-reset" onClick={()=>setDoors({...OFF})}>CLOSE ALL DOORS</button></div>}

     <div className={`quality-dropdown ${qualityOpen?'expanded':''}`}>
      <button className="quality-trigger" aria-label={`Render quality: ${quality}. Choose quality`} onClick={()=>setQualityOpen(v=>!v)} aria-expanded={qualityOpen} aria-controls="quality-options"><Gauge size={17}/><span>RENDER QUALITY</span><strong>{quality.toUpperCase()}</strong><ChevronRight className={qualityOpen?'rotated':''} size={17}/></button>
      {qualityOpen&&<div id="quality-options" className="quality-menu">
       {(['low','balanced','high'] as Quality[]).map(q=><button key={q} className={quality===q?'active':''} aria-pressed={quality===q} onClick={()=>{
         // All modes are selectable without a blocking browser alert.
         // The renderer still enforces a bounded pixel budget for each mode.
         setQuality(q);
         setQualityOpen(false);
       }}>{q.toUpperCase()}{quality===q?' ✓':''}</button>)}
       <p>Low saves GPU resources · Balanced improves detail · High is sharper but uses more GPU memory. All modes have resolution limits.</p>
      </div>}
     </div>
    </div>
   </aside>
   <div className="bottom-cameras">{cameraOptions.map((item,i)=><button key={item.view} className={`camera-card ${view===item.view?'active':''}`} aria-pressed={view===item.view} aria-label={item.subtitle} onClick={()=>changeView(item.view)}><span className={`camera-icon camera-${i}`}>{i===0?<CarFront className="camera-vector" size={37}/>:i===1?<Car className="camera-vector" size={40}/>:i===2?<CarFront className="camera-vector rear-vector" size={37}/>:<ArrowUp className="camera-vector" size={32}/>}</span><span className="camera-label">{item.name}</span></button>)}</div>
   {(allow3d || !webglError) && <button className="pause-render" onClick={()=>{if(allow3d){setAllow3d(false);setWheels({...OFF});setPaused(false);setReady(false)}else{setQuality('low');setAllow3d(true);setReady(false)}}}>{allow3d?'UNLOAD 3D MODEL':'LOAD 3D'}</button>}
   {paused&&<div className="pause-label">3D PAUSED — SELECT RESUME TO CONTINUE</div>}
   <button className="reset-camera" aria-label="Reset camera view" onClick={()=>changeView('hero')}><RotateCcw size={14}/> RESET VIEW</button>
  </main>
  <footer className="mobile-footer"><span>INK AUTOMOTIVE CONFIGURATOR</span><button onClick={share}>SHARE BUILD <ArrowRight size={15}/></button></footer>
 </div>;
}
export default App;
