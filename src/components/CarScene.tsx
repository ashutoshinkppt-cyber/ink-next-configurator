import {Suspense, useEffect, useLayoutEffect, useMemo, useRef, memo} from 'react';
import {Canvas, useFrame, useThree} from '@react-three/fiber';
import {Html, OrbitControls, useGLTF, useProgress} from '@react-three/drei';
import * as THREE from 'three';
import type {OrbitControls as OrbitControlsImpl} from 'three-stdlib';
import {doorPivotMap, interiors, paints, type Quality, type View} from '../config';

type Props={onContextLost?:()=>void;paused?:boolean;paintIndex:number;interiorIndex:number;view:View;quality:Quality;openDoors:Record<string,boolean>;spinningWheels:Record<string,boolean>;headlights?:boolean;taillights?:boolean;debugPaint:boolean;onReady:()=>void};
type Managed={mat:THREE.MeshStandardMaterial;original:{transparent:boolean;opacity:number;depthWrite:boolean;side:THREE.Side};category:'paint'|'glass'|'trim'|'innerPaint'};
type ShellOverlay={mesh:THREE.Mesh;mat:THREE.ShaderMaterial};
const PAINT=new Set(['Car_Paint','Car_Paint.001']);
const GLASS=new Set(['Glass_Mat']);
const SEAT_FRONT='Seat_Mat-1', SEAT_REAR='Seat_Mat-2';
// CAR (1).glb / Blender hierarchy: Front_Light and Back_Light collections may be
// flattened by glTF export. Match both explicit parent groups (if present) and
// all exported mesh names, including Blender's .001, .002 etc suffixes.
// Do NOT classify by material: non-emitting trim shares those materials.
const FRONT_LED_PATTERN=/^Emitters Headlight(?:\.\d{3})?$/;
const REAR_LED_PATTERN=/^(?:MainReflectors Taillight|Reflector TrunkTaillight)(?:\.\d{3})?$/;
const FRONT_LENS_PATTERN=/^(?:Glass Headlight|Glass Runninglight)(?:\.\d{3})?$/;
const REAR_LENS_PATTERN=/^(?:Diffusers Taillight|Diffuser TrunkTaillight|Side Diffuser Taillight\s*)(?:\.\d{3})?$/;
const FRONT_RUNNING_PATTERN=/^Glass Runninglight(?:\.\d{3})?$/;
const REAR_DIFFUSER_PATTERN=/^(?:Diffusers Taillight|Diffuser TrunkTaillight)(?:\.\d{3})?$/;

// Every lit surface gets a lightweight UNLIT material when switched on.
// The off state restores its own cloned GLB material, including original textures.
// This prevents dark source albedo, missing glTF emissiveFactor, and low-PBR
// lighting from making a user-selected LED appear unlit.
function litMaterial(group:'front'|'rear',kind:'emitter'|'diffuser'='emitter'){
 return new THREE.MeshBasicMaterial({name:`INK_${group}_${kind}_LED`,color:group==='front'?'#e4f5ff':'#fa334a',toneMapped:false,side:THREE.DoubleSide,depthTest:true,depthWrite:kind==='emitter',transparent:kind==='diffuser',opacity:kind==='diffuser'?.88:1});
}
const BRAND_NODE_NAME='Car_Name';
type LightSurface={mesh:THREE.Mesh;group:'front'|'rear';offMaterial:THREE.Material|THREE.Material[];onMaterial:THREE.Material|THREE.Material[];originalOrder:number};
type LightLens={mat:THREE.MeshStandardMaterial;group:'front'|'rear';originalColor:THREE.Color;originalTransparent:boolean;originalOpacity:number;originalDepthWrite:boolean;originalTransmission:number|null;originalRoughness:number};
const cameraPresets:Record<View,{pos:[number,number,number];target:[number,number,number]}>= {
 hero:{pos:[4.3,1.85,6.25],target:[0,1.01,0]}, front:{pos:[.2,1.5,7.8],target:[0,.93,0]},side:{pos:[8.2,1.65,.25],target:[0,.95,0]},rear:{pos:[-.2,1.5,-7.8],target:[0,.93,0]},top:{pos:[4.7,6.5,5.3],target:[0,.83,0]}, interior:{pos:[.40,1.3,1.45],target:[-.15,1.10,-.65]},xray:{pos:[5.6,4.55,6.45],target:[0,1.12,0]}
};
function ancestorName(o:THREE.Object3D, name:string){let node:THREE.Object3D|null=o;while(node){if(node.name===name)return true;node=node.parent}return false}
function anyAncestor(o:THREE.Object3D,names:string[]){return names.some(n=>ancestorName(o,n))}

// A directional material transition driven by the actual world-space car geometry.
// GLSL is patched into MeshPhysicalMaterial, preserving clearcoat/PBR reflections.
type WipeControls = {
  progress:{value:number};
  previous:{value:THREE.Color};
  next:{value:THREE.Color};
  direction:{value:number};
};
function createWipeMaterial(name:string, controls:WipeControls){
 const material=new THREE.MeshPhysicalMaterial({
  name, color:'#ffffff', metalness:.34, roughness:.25,
  clearcoat:.95, clearcoatRoughness:.13, side:THREE.FrontSide,
  depthWrite:true, toneMapped:true
 });
 material.onBeforeCompile=(shader)=>{
  shader.uniforms.uWipeProgress=controls.progress;
  shader.uniforms.uWipePrev=controls.previous;
  shader.uniforms.uWipeNext=controls.next;
  shader.uniforms.uWipeDirection=controls.direction;
  shader.vertexShader=shader.vertexShader.replace(
    '#include <common>',
    '#include <common>\nvarying float vWipeZ;'
  ).replace(
    '#include <begin_vertex>',
    '#include <begin_vertex>\nvWipeZ = (modelMatrix * vec4(transformed, 1.0)).z;'
  );
  shader.fragmentShader=shader.fragmentShader.replace(
    '#include <common>',
    '#include <common>\nvarying float vWipeZ;\nuniform float uWipeProgress;\nuniform vec3 uWipePrev;\nuniform vec3 uWipeNext;\nuniform float uWipeDirection;'
  ).replace(
    '#include <color_fragment>',
    `#include <color_fragment>
     // The model's front is +Z, rear is -Z: wipe begins at +Z.
     // Soft moving paint boundary; it always travels from front to rear.
     float normalizedZ = clamp((vWipeZ + 2.5) / 5.0, 0.0, 1.0);
     float positionAlongWipe = mix(normalizedZ, 1.0-normalizedZ, uWipeDirection);
     float sweep = smoothstep(positionAlongWipe - 0.12, positionAlongWipe + 0.12, uWipeProgress * 1.24 - 0.12);
     diffuseColor.rgb *= mix(uWipePrev, uWipeNext, sweep);`
  );
 };
 material.customProgramCacheKey=()=> 'ink-paint-wipe-v11';
 return material;
}
// A procedural automotive ghost shell. The original GLB is not edited.
// Only body-paint mesh primitives receive this overlay, so seat/trim geometry
// does not become an indistinct translucent mass.
function makeGhostMaterial():THREE.ShaderMaterial {
 return new THREE.ShaderMaterial({
  name:'INK_XRay_Pearl_Ghost',
  uniforms:{uReveal:{value:0},uColor:{value:new THREE.Color('#9db1bf')}},
  vertexShader:`
   varying vec3 vWorldNormal;
   varying vec3 vViewDir;
   void main(){
    vec4 worldPos=modelMatrix*vec4(position,1.0);
    vWorldNormal=normalize(mat3(modelMatrix)*normal);
    vViewDir=normalize(cameraPosition-worldPos.xyz);
    gl_Position=projectionMatrix*viewMatrix*worldPos;
   }
  `,
  fragmentShader:`
   uniform float uReveal;
   uniform vec3 uColor;
   varying vec3 vWorldNormal;
   varying vec3 vViewDir;
   void main(){
    float edge=pow(1.0-abs(dot(normalize(vWorldNormal),normalize(vViewDir))),2.6);
    float lines=pow(edge,2.0);
    // Subtle pearl-grey silhouette and bright grazing-angle contour.
    vec3 color=mix(uColor,vec3(0.78,0.87,0.92),edge*0.60);
    float alpha=uReveal*(0.115 + 0.38*edge + 0.12*lines);
    gl_FragColor=vec4(color,clamp(alpha,0.0,0.63));
   }
  `,
  transparent:true,depthWrite:false,depthTest:true,
  side:THREE.FrontSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
 });
}
const Model = memo(function Model({paintIndex,interiorIndex,view,openDoors,spinningWheels,headlights=false,taillights=false,debugPaint,onReady}:Omit<Props,'quality'>){
 const {scene}=useGLTF('/models/car.glb');
 // Keep the uniforms/materials alive across paint clicks. V31 recreated the entire
 // GLB scene on each selection, losing the shader's animated wipe progress.
 const wipe=useMemo<WipeControls>(()=>({
  progress:{value:1},
  previous:{value:new THREE.Color(paints[paintIndex].color)},
  next:{value:new THREE.Color(paints[paintIndex].color)},
  direction:{value:1}
 }),[]);
 const lastPaint=useRef(paintIndex);
 useEffect(()=>{
  if(lastPaint.current===paintIndex)return;
  // Always sweep paint from the front (+Z) toward the rear (-Z).
  // The uniform values are shared by every painted part, including doors.
  wipe.previous.value.copy(wipe.next.value);
  wipe.next.value.set(paints[paintIndex].color);
  wipe.progress.value=0;
  wipe.direction.value=1;
  lastPaint.current=paintIndex;
 },[paintIndex,wipe]);
 const root=useMemo(()=>{
  const copy=scene.clone(true);
  copy.traverse(o=>{
   if(!(o instanceof THREE.Mesh))return;
   const isBrand=ancestorName(o,BRAND_NODE_NAME);
   const original=Array.isArray(o.material)?o.material:[o.material];
   const cloned=original.map(mat=>{
    // IMPORTANT: the car GLB has distinct paint primitives called Car_Paint and
    // Car_Paint.001. Replace EACH primitive's material with a clean independent
    // material. Merely changing imported glTF material.color was insufficient.
    if(!isBrand && PAINT.has(mat.name)){
      const m=createWipeMaterial(mat.name,wipe);
      return m;
    }
    const m=mat.clone();
    if(m instanceof THREE.MeshStandardMaterial){
     if(isBrand){
      m.color.set('#d9d2c9');
      m.metalness=Math.max(.72,m.metalness);
      m.roughness=Math.min(.24,m.roughness);
      m.emissive.set('#3e362f');
      m.emissiveIntensity=.22;
     }
     if(!isBrand && GLASS.has(m.name)){
      m.map=null;m.color.set('#bcc7cd');m.metalness=.02;m.roughness=.12;
      m.transparent=true;m.opacity=.24;m.depthWrite=false;m.side=THREE.FrontSide;
      if(m instanceof THREE.MeshPhysicalMaterial){m.transmission=0;m.thickness=0;m.ior=1.46}
     }
     if(((ancestorName(o,'Seat_FL')||ancestorName(o,'Seat_FR'))&&m.name===SEAT_FRONT)||(ancestorName(o,'Seat_Rear')&&m.name===SEAT_REAR)){
      m.map=null;m.vertexColors=false;m.color.set(interiors[0].color);m.roughness=.78;m.metalness=0;m.toneMapped=true;
     }
     m.needsUpdate=true;
    }
    return m;
   });
   o.material=Array.isArray(o.material)?cloned:cloned[0];o.frustumCulled=true;
  });
  // Car_Name is the original badge/logotype mesh. It remains named and textured
  // as exported; no paint, X-ray or light state ever changes its material.
  // Ground the complete car at y=0, using measured geometry (no GLB edits).
  copy.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(copy);
  if(Number.isFinite(bounds.min.y) && Math.abs(bounds.min.y)<5) copy.position.y-=bounds.min.y;
  return copy;
 },[scene,wipe]);
 const managed=useMemo(()=>{
  const paint:THREE.MeshStandardMaterial[]=[];const seats:THREE.MeshStandardMaterial[]=[];const xray:Managed[]=[];const shellOverlays:ShellOverlay[]=[];
  const pivots:Record<string,THREE.Object3D>={};const lightSurfaces:LightSurface[]=[];const lightLenses:LightLens[]=[];
  root.traverse(o=>{
   if(o.name.startsWith('Pivot_Door_')||o.name.startsWith('Pivot_Tyre_'))pivots[o.name]=o;
   if(!(o instanceof THREE.Mesh))return;
   const isBrand=ancestorName(o,BRAND_NODE_NAME);
   const isBody=anyAncestor(o,['Car_Body','Inner_Body','Door_FL','Door_FR','Door_RL','Door_RR']);
   const isShell=anyAncestor(o,['Car_Body','Door_FL','Door_FR','Door_RL','Door_RR']);
   const isGlass=anyAncestor(o,['Car_Glass','Door_FL','Door_FR','Door_RL','Door_RR']);
   const isSeat=anyAncestor(o,['Seat_FL','Seat_FR','Seat_Rear']);
   // Clone only the visible outer paint surfaces into a lightweight runtime overlay.
   // The overlay shares the original geometry data rather than duplicating vertices.
   const originalMats=Array.isArray(o.material)?o.material:[o.material];
   if(isShell && originalMats.some(m=>PAINT.has(m.name))){
    const ghost=makeGhostMaterial();
    const overlay=new THREE.Mesh(o.geometry,ghost);
    overlay.name='INK_XRay_Ghost_Overlay';
    overlay.renderOrder=20;overlay.visible=false;overlay.frustumCulled=false;
    o.add(overlay);shellOverlays.push({mesh:overlay,mat:ghost});
   }
   for(const m of (Array.isArray(o.material)?o.material:[o.material])){
    if(!(m instanceof THREE.MeshStandardMaterial))continue;
    if(!isBrand && PAINT.has(m.name))paint.push(m);
 
    const lensGroup=isBrand?null:FRONT_LENS_PATTERN.test(o.name)?'front':REAR_LENS_PATTERN.test(o.name)?'rear':null;
    if(lensGroup){
     // Optical covers are passive when off, but must transmit the LED underneath when on.
     const physical=m instanceof THREE.MeshPhysicalMaterial?m:null;
     lightLenses.push({mat:m,group:lensGroup,originalColor:m.color.clone(),originalTransparent:m.transparent,originalOpacity:m.opacity,originalDepthWrite:m.depthWrite,originalTransmission:physical?physical.transmission:null,originalRoughness:m.roughness});
    }
    if(isSeat&&(m.name===SEAT_FRONT||m.name===SEAT_REAR))seats.push(m);
    // Only exterior triangles fade. Crucially, Inner_Body never fades except its paint primitives.
    const category:Managed['category']|null=isGlass&&GLASS.has(m.name)?'glass':isShell?'trim':(ancestorName(o,'Inner_Body')&&PAINT.has(m.name))?'paint':null;
    if(!isBrand && category)xray.push({mat:m,category:PAINT.has(m.name)?'paint':category,original:{transparent:m.transparent,opacity:m.opacity,depthWrite:m.depthWrite,side:m.side}});
   }
   // Name-based mesh-level classification. This never turns the car brand, trim
   // or other meshes into emitters even if they share Headlight Insides.001.
   const emitterGroup = !isBrand && FRONT_LED_PATTERN.test(o.name)?'front':!isBrand&&REAR_LED_PATTERN.test(o.name)?'rear':null;
   const luminousDiffuser = !isBrand && (FRONT_RUNNING_PATTERN.test(o.name)||REAR_DIFFUSER_PATTERN.test(o.name));
   if(emitterGroup || luminousDiffuser){
    const group = emitterGroup || (FRONT_RUNNING_PATTERN.test(o.name)?'front':'rear');
    const original = o.material;
    const off = Array.isArray(original) ? original.slice() : original;
    const replacement = (material:THREE.Material):THREE.Material => {
     // Front running light has two materials; only the specific running-light
     // glass illuminates. Other optical elements stay as their source material.
     if(!emitterGroup && group==='front' && material.name!=='GlassRunninglight.001')return material;
     return litMaterial(group,emitterGroup?'emitter':'diffuser');
    };
    const on = Array.isArray(off) ? off.map(replacement) : replacement(off);
    lightSurfaces.push({mesh:o,group,offMaterial:off,onMaterial:on,originalOrder:o.renderOrder});
   }
  });
  return {paint,seats,xray,shellOverlays,pivots,lightSurfaces,lightLenses,initialDoor:Object.fromEntries(Object.values(doorPivotMap).map(d=>[d.name,pivots[d.name]?.rotation.y??0])),initialWheel:Object.fromEntries(['FL','FR','RL','RR'].map(k=>[k,pivots[`Pivot_Tyre_${k}`]?.rotation.x??0]))};
 },[root]);
 const xrayLevel=useRef(0);const didNotifyReady=useRef(false);const wheelAngles=useRef<Record<string,number>>({FL:0,FR:0,RL:0,RR:0});
 useEffect(()=>{
  if(!debugPaint){
   wipe.previous.value.set(paints[paintIndex].color);
   wipe.next.value.set(paints[paintIndex].color);
   wipe.progress.value=1;
  }
 },[debugPaint,wipe]);
 // Apply light states immediately on every click (including when R3F runs in
 // demand mode). Replacing the emitter's material uses no extra draw calls.
 useEffect(()=>{
  for(const surface of managed.lightSurfaces){
   const enabled=surface.group==='front'?headlights:taillights;
   surface.mesh.material=enabled?surface.onMaterial:surface.offMaterial;
   surface.mesh.renderOrder=enabled?2:surface.originalOrder;
  }
  for(const lens of managed.lightLenses){
   const enabled=lens.group==='front'?headlights:taillights;
   const m=lens.mat;
   // In OFF mode: a naturally tinted but unlit lens.
   // In ON mode: allow the separately colored emitter/diffuser through.
   const requiresCompile=!m.transparent || (m instanceof THREE.MeshPhysicalMaterial && (m.transmission!==0 || m.thickness!==0));
   m.transparent=true;
   m.opacity=lens.group==='front'?(enabled?.10:.78):(enabled?.19:.68);
   m.depthWrite=false;
   m.roughness=enabled?.13:.24;
   m.color.copy(lens.originalColor);
   if(lens.group==='rear')m.color.set(enabled?'#f76470':'#68252a');
   if(lens.group==='front'&&enabled)m.color.set('#f4f9ff');
   if(m instanceof THREE.MeshPhysicalMaterial){m.transmission=0;m.thickness=0}
   // Only compile the transparent-lens shader once; repeated light clicks must
   // not rebuild GPU programs (a source of avoidable graphics spikes).
   if(requiresCompile)m.needsUpdate=true;
  }
 },[managed,headlights,taillights]);
 const seatTarget=useMemo(()=>new THREE.Color(interiors[interiorIndex].color),[interiorIndex]);
 // Avoid marking the model ready before it has had its first render update.
 useFrame((_,delta)=>{
  if(!didNotifyReady.current){didNotifyReady.current=true;onReady()}
  const dt=Math.min(delta,.05),k=1-Math.exp(-dt*3.5);const p=paints[paintIndex];
  if(wipe.progress.value<1)wipe.progress.value=Math.min(1,wipe.progress.value+dt/1.65);
  managed.paint.forEach(m=>{
   // Diagnostics must override the shader colors, not merely the base tint.
   if(debugPaint){wipe.previous.value.set('#ff00ff');wipe.next.value.set('#ff00ff');wipe.progress.value=1;}
   m.color.set('#ffffff');
   m.roughness=THREE.MathUtils.damp(m.roughness,Math.max(.34,p.roughness),3.5,dt);
   m.metalness=THREE.MathUtils.damp(m.metalness,Math.min(.22,p.metalness),3.5,dt);
   if(m instanceof THREE.MeshPhysicalMaterial){m.clearcoat=THREE.MathUtils.damp(m.clearcoat,Math.min(.7,p.clearcoat),3.5,dt)}
  });
  managed.seats.forEach(m=>m.color.lerp(seatTarget,k));
  // Lamp states update synchronously in the effect below, not from the
  // frame loop. This lets OFF/ON remain reliable with demand rendering.
  xrayLevel.current=THREE.MathUtils.damp(xrayLevel.current,view==='xray'?1:0,3.8,dt);
  const t=xrayLevel.current;
  managed.xray.forEach(({mat,original,category})=>{
   const active=t>.002;
   // For X-ray, reduce opacity of actual exterior primitives, not the cabin.
   // Remove dark multilayer exterior clutter; pearl ghost overlays define the body.
   const finalOpacity=category==='glass'?.055:category==='paint'?.045:.10;
   mat.opacity=THREE.MathUtils.lerp(original.opacity,finalOpacity,t);
   // A subtle cool neutral tint helps the shell read as a transparent body,
   // not as invisible missing geometry. Preserve underlying paint state.
   mat.depthWrite=active?false:original.depthWrite;
   const transparent=active||original.transparent;
   if(mat.transparent!==transparent){mat.transparent=transparent;mat.needsUpdate=true}
   if(mat.side!==original.side){mat.side=original.side;mat.needsUpdate=true}
  });
  managed.shellOverlays.forEach(({mesh,mat})=>{
   const a=mat.uniforms.uReveal; a.value=t;
   mesh.visible=t>.008;
  });
  Object.entries(doorPivotMap).forEach(([key,d])=>{
   const pivot=managed.pivots[d.name];if(!pivot)return;
   // Car forward is +Z. The back edge of each door is behind its hinge, so
   // on the +X (left) side the outward-opening rotation is negative about Y.
   const target=managed.initialDoor[d.name]+(openDoors[key] ? d.sign*d.angle : 0);
   pivot.rotation.y=THREE.MathUtils.damp(pivot.rotation.y,target,5,dt);
  });
  for(const key of ['FL','FR','RL','RR']){
   const pivot=managed.pivots[`Pivot_Tyre_${key}`];if(!pivot)continue;
   if(spinningWheels[key])wheelAngles.current[key]+=dt*2.3;
   pivot.rotation.x=managed.initialWheel[key]+wheelAngles.current[key];
  }
 });
 useEffect(()=>()=>{
  // Release every material clone and each LED override. Geometry/textures belong
  // to useGLTF's shared cache and must not be disposed here.
  const dispose=new Set<THREE.Material>();
  root.traverse(o=>{if(o instanceof THREE.Mesh){for(const m of (Array.isArray(o.material)?o.material:[o.material]))dispose.add(m)}});
  for(const s of managed.lightSurfaces){
   for(const m of (Array.isArray(s.offMaterial)?s.offMaterial:[s.offMaterial]))dispose.add(m);
   for(const m of (Array.isArray(s.onMaterial)?s.onMaterial:[s.onMaterial]))dispose.add(m);
  }
  dispose.forEach(m=>m.dispose());
 },[root,managed]);
 return <primitive object={root}/>;
});
function CameraRig({view,controls}:{view:View;controls:React.RefObject<OrbitControlsImpl|null>}){
 const {camera,invalidate,size}=useThree();const anim=useRef(true);const desired=new THREE.Vector3(),target=new THREE.Vector3();
 useEffect(()=>{anim.current=true;invalidate()},[view,invalidate,size.width,size.height]);
 useFrame((_,delta)=>{
  if(!anim.current)return;
  const c=cameraPresets[view],k=1-Math.exp(-Math.min(delta,.05)*2.35);
  desired.set(...c.pos);target.set(...c.target);
  // Narrow stages need more distance to keep both bumpers visible.
  const aspect=size.width/Math.max(1,size.height);
  const fit=aspect<.8?1.36:aspect<1.18?1.16:1;
  desired.sub(target).multiplyScalar(fit).add(target);
  camera.position.lerp(desired,k);
  if(controls.current){controls.current.target.lerp(target,k);controls.current.update()}
  if(camera.position.distanceTo(desired)<.025&&(!controls.current||controls.current.target.distanceTo(target)<.025))anim.current=false;
 });return null;
}
function CabinLighting({view}:{view:View}){
 const front=useRef<THREE.PointLight>(null);
 const rear=useRef<THREE.PointLight>(null);
 useFrame((_,delta)=>{
  const t=view==='xray'?1:0;
  if(front.current)front.current.intensity=THREE.MathUtils.damp(front.current.intensity,t*1.15,4,Math.min(delta,.05));
  if(rear.current)rear.current.intensity=THREE.MathUtils.damp(rear.current.intensity,t*.8,4,Math.min(delta,.05));
 });
 return <><pointLight ref={front} position={[.15,2.38,.55]} color="#fff1dc" intensity={0} distance={3.7} decay={2}/><pointLight ref={rear} position={[0,2.4,-1]} color="#f4e5d5" intensity={0} distance={3.5} decay={2}/></>;
}
function Loader(){const {progress}=useProgress();return <Html center><div className="webgl-loading"><div className="loader-ring"/><span>PREPARING YOUR VEHICLE</span><strong>{Math.round(progress)}%</strong></div></Html>}
function RenderScheduler({signal,spinning,quality}:{signal:string;spinning:boolean;quality:Quality}){
 const {invalidate}=useThree();
 const qualityRef=useRef(quality);
 qualityRef.current=quality;
 // Paint, doors, camera and X-ray still animate for a bounded time.
 // A quality-only change must not restart that multi-second animation cycle.
 useEffect(()=>{
  let timeout=0;
  let cancelled=false;
  const deadline=performance.now()+3200;
  const tick=()=>{
   if(cancelled)return;
   invalidate();
   if(!spinning && performance.now()>=deadline)return;
   const q=qualityRef.current;
   const fps=q==='low'?20:q==='balanced'?26:32;
   timeout=window.setTimeout(tick,1000/fps);
  };
  tick();
  return ()=>{cancelled=true;window.clearTimeout(timeout)};
 },[signal,spinning,invalidate]);
 useEffect(()=>{
  // DPR is applied in useLayoutEffect. These two redraws expose the new
  // quality without a new 3.2 second timer.
  invalidate();
  const raf=window.requestAnimationFrame(()=>invalidate());
  const timer=window.setTimeout(()=>invalidate(),100);
  return ()=>{window.cancelAnimationFrame(raf);window.clearTimeout(timer)};
 },[quality,invalidate]);
 return null;
}
// Listener lifecycle follows React, so manual/unintentional unmounts do not
// report a false WebGL failure when three.js intentionally disposes the canvas.
function GraphicsContextGuard({onLost}:{onLost?:()=>void}){
 const {gl}=useThree();
 useEffect(()=>{
   const canvas=gl.domElement;
   const onLostEvent=(event:Event)=>{event.preventDefault();onLost?.()};
   canvas.addEventListener('webglcontextlost',onLostEvent);
   return ()=>canvas.removeEventListener('webglcontextlost',onLostEvent);
 },[gl,onLost]);
 return null;
}
function PixelRatioLimiter({quality}:{quality:Quality}){
 const {setDpr,size,invalidate}=useThree();
 useLayoutEffect(()=>{
  // High is selectable, but intentionally capped below native resolution.
  // A cap on total frame pixels also limits large desktop or external monitors.
  const desired=quality==='low'?.70:quality==='balanced'?.90:1.10;
  const pixelBudget=quality==='low'?1_000_000:quality==='balanced'?1_650_000:2_200_000;
  const fit=Math.sqrt(pixelBudget/Math.max(1,size.width*size.height));
  setDpr(Math.max(.3,Math.min(desired,fit)));
  invalidate();
 },[quality,size.width,size.height,setDpr,invalidate]);
 return null;
}
const ShowroomArchitecture = memo(function ShowroomArchitecture(){
 // Static geometry only, no expensive realtime reflection framebuffer.
 
 return <group>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.018,0]}>
   <planeGeometry args={[45,45]}/>
   <meshStandardMaterial color="#f3ede5" metalness={.05} roughness={.68}/>
  </mesh>
  {/* Soft contact ellipse; no shadow map or expensive framebuffer. */}
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,.002,0]}>
   <circleGeometry args={[2.15,48]}/><meshBasicMaterial color="#5d4e45" transparent opacity={.028} depthWrite={false}/>
  </mesh>
  {/* The floor ring is physical scene geometry so it is not hidden by the opaque WebGL canvas. */}
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,.006,0]}>
   <torusGeometry args={[3.46,.012,8,144]}/>
   <meshBasicMaterial color="#e9d8ba" toneMapped={false}/>
  </mesh>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,.004,0]}>
   <torusGeometry args={[3.46,.14,6,144]}/>
   <meshBasicMaterial color="#d4b48f" transparent opacity={.07} depthWrite={false}/>
  </mesh>
  {/* Suspended ceiling ring, seen as an ellipse from the normal car camera. */}
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,4.75,0]}>
   <torusGeometry args={[3.35,.027,7,144]}/>
   <meshBasicMaterial color="#f6f3e9" toneMapped={false}/>
  </mesh>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,4.745,0]}>
   <torusGeometry args={[3.35,.13,7,144]}/>
   <meshBasicMaterial color="#e5d9cb" transparent opacity={.095} depthWrite={false}/>
  </mesh>

 </group>;
});
export function CarScene(props:Props){
 const controls=useRef<OrbitControlsImpl|null>(null);
 const signal=[props.paintIndex,props.interiorIndex,props.view,!!props.headlights,!!props.taillights,props.debugPaint,...Object.values(props.openDoors),...Object.values(props.spinningWheels)].join('|');
 const spinning=Object.values(props.spinningWheels).some(Boolean);
 return <Canvas frameloop={props.paused?'never':'demand'} dpr={0.7} gl={{antialias:true,powerPreference:'low-power',alpha:true,precision:'highp',stencil:false,depth:true}} camera={{position:[5.4,2.22,7.65],fov:38,near:.03,far:120}} onCreated={({gl})=>{gl.outputColorSpace=THREE.SRGBColorSpace;gl.toneMapping=THREE.ACESFilmicToneMapping;gl.toneMappingExposure=.96}}>
 <GraphicsContextGuard onLost={props.onContextLost}/>
 <PixelRatioLimiter quality={props.quality}/><RenderScheduler signal={signal} spinning={spinning} quality={props.quality}/>
 <ShowroomArchitecture/>
 <ambientLight intensity={1.28}/><hemisphereLight intensity={1.32} color="#fffaf4" groundColor="#b8afa7"/>
 <directionalLight intensity={1.75} position={[4.2,7.2,6.4]} color="#fffaf2"/>
 <directionalLight intensity={1.35} position={[-5.2,4.6,-4.6]} color="#f5f3f0"/>
 <directionalLight intensity={1.05} position={[0,5.4,0]} color="#ffffff"/>
 <directionalLight intensity={1.05} position={[-2.5,2.4,5.4]} color="#fff2e8"/>
 <pointLight intensity={1.1} position={[0,3.9,2.8]} distance={18} decay={2} color="#fff6ea"/>
 <pointLight intensity={.62} position={[0,2.8,-3.2]} distance={16} decay={2} color="#f8f2ea"/>
 

 <Suspense fallback={<Loader/>}><Model paintIndex={props.paintIndex} interiorIndex={props.interiorIndex} view={props.view} openDoors={props.openDoors} spinningWheels={props.spinningWheels} headlights={props.headlights} taillights={props.taillights} debugPaint={props.debugPaint} onReady={props.onReady}/></Suspense>
  <CabinLighting view={props.view}/>
 <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping dampingFactor={.08} minDistance={2.5} maxDistance={14} minPolarAngle={.13} maxPolarAngle={Math.PI/2.04}/>
 <CameraRig view={props.view} controls={controls}/>
 </Canvas>
}
