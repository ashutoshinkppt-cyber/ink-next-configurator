import {Suspense, useEffect, useMemo, useRef, useState} from 'react';
import {Canvas, useFrame, useThree} from '@react-three/fiber';
import {ContactShadows, Environment, Html, OrbitControls, useGLTF, useProgress} from '@react-three/drei';
import * as THREE from 'three';
import type {OrbitControls as OrbitControlsImpl} from 'three-stdlib';
import {doorPivotMap, interiors, paints, type Quality, type View} from '../config';

type Props={paused?:boolean;paintIndex:number;interiorIndex:number;view:View;quality:Quality;openDoors:Record<string,boolean>;spinningWheels:Record<string,boolean>;headlights:boolean;taillights:boolean;debugPaint:boolean;onReady:()=>void};
type Managed={mat:THREE.MeshStandardMaterial;original:{transparent:boolean;opacity:number;depthWrite:boolean;side:THREE.Side};category:'paint'|'glass'|'trim'|'innerPaint'};
type ShellOverlay={mesh:THREE.Mesh;mat:THREE.ShaderMaterial};
const PAINT=new Set(['Car_Paint','Car_Paint.001']);
const GLASS=new Set(['Glass_Mat']);
const SEAT_FRONT='Seat_Mat-1', SEAT_REAR='Seat_Mat-2';
// Exact material names found in CAR(5).glb. Only meshes under Car_Lights
// are modified, to prevent Light_Mat in Inner_Body from glowing.
const FRONT_EMITTERS=new Set(['Light_Mat','GlassRunninglight','emission']);
const REAR_EMITTERS=new Set(['Taillight']);
type LightSurface={mat:THREE.MeshStandardMaterial;group:'front'|'rear';baseColor:THREE.Color;baseEmissive:THREE.Color;baseIntensity:number};
const cameraPresets:Record<View,{pos:[number,number,number];target:[number,number,number]}>= {
 hero:{pos:[4.9,2.15,6.9],target:[0,1.08,0]}, front:{pos:[.2,1.5,7.8],target:[0,.93,0]},side:{pos:[8.2,1.65,.25],target:[0,.95,0]},rear:{pos:[-.2,1.5,-7.8],target:[0,.93,0]},top:{pos:[4.7,6.5,5.3],target:[0,.83,0]}, interior:{pos:[.40,1.3,1.45],target:[-.15,1.10,-.65]},xray:{pos:[5.6,4.55,6.45],target:[0,1.12,0]}
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
     // Car's approximate body extent is -2.5 to +2.5 along Z.
     // Soft moving paint boundary; direction alternates on each selection.
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
function Model({paintIndex,interiorIndex,view,openDoors,spinningWheels,headlights,taillights,debugPaint,onReady}:Omit<Props,'quality'>){
 const {scene}=useGLTF('/models/car.glb');
 const wipe=useMemo<WipeControls>(()=>({
  progress:{value:1},
  previous:{value:new THREE.Color(paints[0].color)},
  next:{value:new THREE.Color(paints[0].color)},
  direction:{value:0}
 }),[]);
 const lastPaint=useRef(0);
 useEffect(()=>{
  if(lastPaint.current===paintIndex)return;
  // A new selection restarts the wave from the previous selected finish.
  wipe.previous.value.copy(wipe.next.value);
  wipe.next.value.set(paints[paintIndex].color);
  wipe.progress.value=0;
  wipe.direction.value=1-wipe.direction.value;
  lastPaint.current=paintIndex;
 },[paintIndex,wipe]);
 const root=useMemo(()=>{
  const copy=scene.clone(true);
  copy.traverse(o=>{
   if(!(o instanceof THREE.Mesh))return;
   const original=Array.isArray(o.material)?o.material:[o.material];
   const cloned=original.map(mat=>{
    // IMPORTANT: the car GLB has distinct paint primitives called Car_Paint and
    // Car_Paint.001. Replace EACH primitive's material with a clean independent
    // material. Merely changing imported glTF material.color was insufficient.
    if(PAINT.has(mat.name)){
      const m=createWipeMaterial(mat.name,wipe);
      return m;
    }
    const m=mat.clone();
    if(m instanceof THREE.MeshStandardMaterial){
     if(GLASS.has(m.name)){
      m.map=null;m.color.set('#a4bcc6');m.metalness=0;m.roughness=.16;
      m.transparent=true;m.opacity=.28;m.depthWrite=false;m.side=THREE.FrontSide;
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
  // Ground the complete car at y=0, using measured geometry (no GLB edits).
  copy.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(copy);
  if(Number.isFinite(bounds.min.y) && Math.abs(bounds.min.y)<5) copy.position.y-=bounds.min.y;
  return copy;
 },[scene,wipe]);
 const managed=useMemo(()=>{
  const paint:THREE.MeshStandardMaterial[]=[];const seats:THREE.MeshStandardMaterial[]=[];const xray:Managed[]=[];const shellOverlays:ShellOverlay[]=[];
  const pivots:Record<string,THREE.Object3D>={};const lightSurfaces:LightSurface[]=[];
  root.traverse(o=>{
   if(o.name.startsWith('Pivot_Door_')||o.name.startsWith('Pivot_Tyre_'))pivots[o.name]=o;
   if(!(o instanceof THREE.Mesh))return;
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
    if(PAINT.has(m.name))paint.push(m);
    if(ancestorName(o,'Car_Lights')){
     const group=FRONT_EMITTERS.has(m.name)?'front':REAR_EMITTERS.has(m.name)?'rear':null;
     if(group){lightSurfaces.push({mat:m,group,baseColor:m.color.clone(),baseEmissive:m.emissive.clone(),baseIntensity:m.emissiveIntensity});}
    }
    if(isSeat&&(m.name===SEAT_FRONT||m.name===SEAT_REAR))seats.push(m);
    // Only exterior triangles fade. Crucially, Inner_Body never fades except its paint primitives.
    const category:Managed['category']|null=isGlass&&GLASS.has(m.name)?'glass':isShell?'trim':(ancestorName(o,'Inner_Body')&&PAINT.has(m.name))?'paint':null;
    if(category)xray.push({mat:m,category:PAINT.has(m.name)?'paint':category,original:{transparent:m.transparent,opacity:m.opacity,depthWrite:m.depthWrite,side:m.side}});
   }
  });
  return {paint,seats,xray,shellOverlays,pivots,lightSurfaces,initialDoor:Object.fromEntries(Object.values(doorPivotMap).map(d=>[d.name,pivots[d.name]?.rotation.y??0])),initialWheel:Object.fromEntries(['FL','FR','RL','RR'].map(k=>[k,pivots[`Pivot_Tyre_${k}`]?.rotation.x??0]))};
 },[root]);
 const xrayLevel=useRef(0);const wheelAngles=useRef<Record<string,number>>({FL:0,FR:0,RL:0,RR:0});
 useEffect(()=>{
  if(!debugPaint){
   wipe.previous.value.set(paints[paintIndex].color);
   wipe.next.value.set(paints[paintIndex].color);
   wipe.progress.value=1;
  }
 },[debugPaint,wipe]);
 const seatTarget=useMemo(()=>new THREE.Color(interiors[interiorIndex].color),[interiorIndex]);
 useEffect(()=>{onReady()},[onReady]);
 useFrame((_,delta)=>{
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
  // Interpolate actual GLB light-surface emissive channels for smooth on/off.
  for(const surface of managed.lightSurfaces){
   const lit=surface.group==='front'?headlights:taillights;
   // The GLB contains large, flat lamp material regions. A large emission
   // value turns them into white/orange polygon blocks. Keep their surface
   // geometry visible, tint the active lens, and use restrained emission.
   const isFront=surface.group==='front';
   const litColor=new THREE.Color(isFront?'#e4edff':'#bc1028');
   const lensColor=surface.baseColor.clone().lerp(litColor,isFront?.36:.76);
   surface.mat.color.lerp(lit?lensColor:surface.baseColor,k*1.6);
   surface.mat.emissive.lerp(lit?litColor:surface.baseEmissive,k*1.6);
   surface.mat.emissiveIntensity=THREE.MathUtils.damp(surface.mat.emissiveIntensity,lit?(isFront?.42:.48):Math.min(surface.baseIntensity,.08),6,dt);
   surface.mat.toneMapped=true;
   // Detailed LED strips cannot be invented by shader intensity: they require
   // separate LED-only faces/material slots in the GLB for a pixel-perfect look.
  }
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
 useEffect(()=>()=>{root.traverse(o=>{if(o instanceof THREE.Mesh)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose())})},[root]);
 return <primitive object={root}/>;
}
function CameraRig({view,controls}:{view:View;controls:React.RefObject<OrbitControlsImpl|null>}){
 const {camera,invalidate}=useThree();const anim=useRef(true);const desired=new THREE.Vector3(),target=new THREE.Vector3();
 useEffect(()=>{anim.current=true;invalidate()},[view,invalidate]);
 useFrame((_,delta)=>{
  if(!anim.current)return;
  const c=cameraPresets[view],k=1-Math.exp(-Math.min(delta,.05)*2.35);
  desired.set(...c.pos);target.set(...c.target);camera.position.lerp(desired,k);
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
function RenderScheduler({signal,spinning}:{signal:string;spinning:boolean}){
 const {invalidate}=useThree();
 const timeLeft=useRef(0);
 useEffect(()=>{timeLeft.current=3;invalidate()},[signal,invalidate]);
 useFrame((_,dt)=>{
  timeLeft.current=Math.max(0,timeLeft.current-Math.min(dt,.05));
  if(timeLeft.current>0||spinning)invalidate();
 });
 return null;
}
function ShowroomArchitecture({quality}:{quality:Quality}){
 // Static geometry only, no expensive realtime reflection framebuffer.
 const lines=useMemo(()=>Array.from({length:11},(_,i)=>i-5),[]);
 return <group>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.018,0]}>
   <planeGeometry args={[45,45]}/>
   <meshStandardMaterial color="#e9e0d7" metalness={.12} roughness={quality==='high'?.27:.46}/>
  </mesh>
  {false && lines.map(i=><group key={i}>
   <mesh rotation={[-Math.PI/2,0,0]} position={[i*1.7,-.009,0]}>
    <planeGeometry args={[.009,34]}/><meshBasicMaterial color="#cfc1b7" depthWrite={false}/>
   </mesh>
   <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.008,i*1.7]}>
    <planeGeometry args={[34,.009]}/><meshBasicMaterial color="#cfc1b7" depthWrite={false}/>
   </mesh>
  </group>)}
  {/* Soft contact ellipse; no shadow map or expensive framebuffer. */}
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,.002,0]}>
   <circleGeometry args={[2.7,64]}/><meshBasicMaterial color="#8f8278" transparent opacity={.09} depthWrite={false}/>
  </mesh>
  {/* The floor ring is physical scene geometry so it is not hidden by the opaque WebGL canvas. */}
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,.006,0]}>
   <torusGeometry args={[3.46,.023,8,144]}/>
   <meshBasicMaterial color="#e9c6a2" toneMapped={false}/>
  </mesh>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,.004,0]}>
   <torusGeometry args={[3.46,.095,6,144]}/>
   <meshBasicMaterial color="#c79b70" transparent opacity={.17} depthWrite={false}/>
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
  {[-5,5].map(x=><mesh key={x} position={[x,1.8,-3.3]}>
   <boxGeometry args={[.06,2.3,.06]}/><meshBasicMaterial color="#fff2d9"/>
  </mesh>)}
 </group>;
}
export function CarScene(props:Props){
 const controls=useRef<OrbitControlsImpl|null>(null);
 const signal=[props.paintIndex,props.interiorIndex,props.view,props.headlights,props.taillights,props.debugPaint,...Object.values(props.openDoors),...Object.values(props.spinningWheels),props.quality].join('|');
 const spinning=Object.values(props.spinningWheels).some(Boolean);
 return <Canvas frameloop={props.paused?'never':'demand'} dpr={props.quality==='low'?.6:props.quality==='balanced'?.8:1} gl={{antialias:false,powerPreference:'low-power',alpha:true,precision:'mediump',stencil:false,depth:true}} camera={{position:[5.4,2.22,7.65],fov:38,near:.03,far:120}} onCreated={({gl})=>{gl.outputColorSpace=THREE.SRGBColorSpace;gl.toneMapping=THREE.ACESFilmicToneMapping;gl.toneMappingExposure=.82}}>
 <RenderScheduler signal={signal} spinning={spinning}/>
 <ShowroomArchitecture quality={props.quality}/>
 <ambientLight intensity={.52}/><hemisphereLight intensity={.85} color="#fff8ee" groundColor="#b3a89c"/>
 <directionalLight intensity={1.65} position={[4,7,6]} color="#fffaf2"/><directionalLight intensity={.95} position={[-5,4,-4]} color="#e8f1ff"/><directionalLight intensity={.6} position={[0,5,0]} color="#ffffff"/>
 

 <Suspense fallback={<Loader/>}><Model paintIndex={props.paintIndex} interiorIndex={props.interiorIndex} view={props.view} openDoors={props.openDoors} spinningWheels={props.spinningWheels} headlights={props.headlights} taillights={props.taillights} debugPaint={props.debugPaint} onReady={props.onReady}/></Suspense>
  <CabinLighting view={props.view}/>
 <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping dampingFactor={.08} minDistance={2.5} maxDistance={14} minPolarAngle={.13} maxPolarAngle={Math.PI/2.04}/>
 <CameraRig view={props.view} controls={controls}/>
 </Canvas>
}
