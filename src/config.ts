export const paints = [
  {name:'Pearl White', color:'#eae9e4', metalness:.38, roughness:.24, clearcoat:1},
  {name:'Midnight Blue', color:'#183451', metalness:.68, roughness:.2, clearcoat:1},
  {name:'Moonstone', color:'#92989b', metalness:.73, roughness:.24, clearcoat:.95},
  {name:'Obsidian Black', color:'#101315', metalness:.45, roughness:.15, clearcoat:1},
  {name:'Garnet Red', color:'#812c35', metalness:.6, roughness:.19, clearcoat:1},
  {name:'Champagne', color:'#a6987d', metalness:.63, roughness:.23, clearcoat:1},
  {name:'Emerald Green', color:'#075c4e', metalness:.55, roughness:.2, clearcoat:1},
  {name:'Warm Gold', color:'#b48a43', metalness:.7, roughness:.24, clearcoat:1}
] as const;
export const interiors = [
  {name:'Ivory',color:'#dbd4c7'},
  {name:'Graphite',color:'#383b3c'},
  {name:'Cognac',color:'#936647'},
  {name:'Garnet Leather',color:'#782e32'}
] as const;
export type View = 'hero'|'front'|'side'|'rear'|'top'|'interior'|'xray';
export type Quality = 'low'|'balanced'|'high';
// Adjust +/- direction for a particular door if the original Blender pivot uses the reverse orientation.
export const doorPivotMap: Record<string,{name:string;sign:number;angle:number}> = {
  FL:{name:'Pivot_Door_FL',sign:-1,angle:1.05},
  FR:{name:'Pivot_Door_FR',sign:1,angle:1.05},
  RL:{name:'Pivot_Door_RL',sign:-1,angle:.94},
  RR:{name:'Pivot_Door_RR',sign:1,angle:.94}
};
