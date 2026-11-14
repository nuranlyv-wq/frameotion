// A bounded native optical material. Only the already-painted scene is sampled;
// the node's children (copy and controls) are painted afterwards and stay sharp.
export function glassSettings(node,pose={}) {
 const liquid=node.material==='liquid-glass',g=node.glass??{},strength=pose.glassStrength??node.glassStrength??1;
 return {blur:(g.blur??(liquid?2.5:12))*strength,refraction:(g.refraction??(liquid?24:4))*strength,
  dispersion:(g.dispersion??(liquid?1.2:.25))*strength,tint:(g.tint??(liquid?.055:.14))*strength,
  edge:g.edge??(liquid?24:18),shine:(g.shine??(liquid?.48:.2))*strength};
}
export function glassPainter(canvas) {
 const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,preserveDrawingBuffer:true,antialias:false});if(!gl)return null;
 const compile=(type,body)=>{const s=gl.createShader(type);gl.shaderSource(s,body);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
 const program=gl.createProgram();
 const weights=[1,4,6,4,1],blurSum=weights.flatMap((wy,y)=>weights.map((wx,x)=>`texture2D(scene,uv+vec2(${x-2}.0,${y-2}.0)*d).rgb*${(wx*wy/256).toFixed(8)}`)).join('+');
 gl.attachShader(program,compile(gl.VERTEX_SHADER,'attribute vec4 position;attribute vec2 uv;varying vec2 local;void main(){gl_Position=position;local=uv;}'));
 gl.attachShader(program,compile(gl.FRAGMENT_SHADER,`precision highp float;
 varying vec2 local;uniform sampler2D scene;uniform vec2 resolution,size;uniform vec2 axisX,axisY;
 uniform float radius,blurAmount,refractAmount,dispersion,tintAmount,edgeWidth,shine,aa;uniform vec3 tintColor;
 float sdf(vec2 p){vec2 q=abs(p)-(size*.5-vec2(radius));return length(max(q,0.))+min(max(q.x,q.y),0.)-radius;}
 vec3 frosted(vec2 uv){if(blurAmount<.01)return texture2D(scene,uv).rgb;vec2 d=vec2(blurAmount*.5)/resolution;return ${blurSum};}
 void main(){vec2 p=(local-.5)*size;float dist=sdf(p),mask=1.-smoothstep(-aa,aa,dist);if(mask<.001)discard;
  vec2 n=normalize(vec2(sdf(p+vec2(.5,0.))-sdf(p-vec2(.5,0.)),sdf(p+vec2(0.,.5))-sdf(p-vec2(0.,.5)))+vec2(.00001));
  float rim=1.-smoothstep(0.,edgeWidth,max(0.,-dist));vec2 normal=normalize(axisX*n.x+axisY*n.y);
  vec2 screen=vec2(gl_FragCoord.x, resolution.y-gl_FragCoord.y)/resolution;
  vec2 bend=normal*(sin(rim*1.5707963)*refractAmount)/resolution;
  vec3 color=frosted(screen-bend);vec2 split=normal*rim*dispersion/resolution;
  color.r=mix(color.r,texture2D(scene,screen-bend+split).r,min(1.,rim*.7));color.b=mix(color.b,texture2D(scene,screen-bend-split).b,min(1.,rim*.7));
  color=mix(color,tintColor,clamp(tintAmount,0.,.8));
  float lip=exp(-abs(dist+1.2)/1.6);float light=.25+.75*max(0.,dot(n,normalize(vec2(-.5,-.8))));
  color+=vec3(lip*shine*light);color-=vec3(rim*.045*min(1.,refractAmount/12.));
  gl_FragColor=vec4(clamp(color,0.,1.)*mask,mask);
 }`));
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const vertices=gl.createBuffer(),uvs=gl.createBuffer(),pos=gl.getAttribLocation(program,'position'),uv=gl.getAttribLocation(program,'uv');
 gl.bindBuffer(gl.ARRAY_BUFFER,uvs);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,1,1]),gl.STATIC_DRAW);gl.enableVertexAttribArray(uv);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,0,0);gl.enableVertexAttribArray(pos);
 const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.uniform1i(gl.getUniformLocation(program,'scene'),0);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);
 const loc=name=>gl.getUniformLocation(program,name),locations=Object.fromEntries(['resolution','size','axisX','axisY','radius','blurAmount','refractAmount','dispersion','tintAmount','edgeWidth','shine','aa','tintColor'].map(k=>[k,loc(k)]));
 return (node,snapshot,item,matrix,focal,palette)=>{
  const {pose,points}=item,g=glassSettings(node,pose),w=canvas.width,h=canvas.height;
  const screen=points.map(p=>({x:matrix.a*p.x+matrix.c*p.y+matrix.e,y:matrix.b*p.x+matrix.d*p.y+matrix.f,z:p.z}));
  const axis=(a,b)=>{const x=b.x-a.x,y=b.y-a.y,l=Math.hypot(x,y)||1;return [x/l,y/l];};
  gl.useProgram(program);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,snapshot);
  gl.uniform2f(locations.resolution,w,h);gl.uniform2f(locations.size,pose.w,pose.h);gl.uniform2f(locations.axisX,...axis(screen[0],screen[1]));gl.uniform2f(locations.axisY,...axis(screen[0],screen[3]));
  const scale=Math.hypot(screen[1].x-screen[0].x,screen[1].y-screen[0].y)/pose.w;
  for(const [key,value]of Object.entries({radius:Math.min(pose.radius??node.radius??24,pose.w/2,pose.h/2),blurAmount:g.blur*scale,refractAmount:g.refraction*scale,dispersion:g.dispersion*scale,tintAmount:g.tint,edgeWidth:g.edge,shine:g.shine,aa:1/Math.max(.1,scale)}))gl.uniform1f(locations[key],value);
  const hex=palette[node.fill??'surface'];gl.uniform3f(locations.tintColor,...[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255));
  const data=[screen[0],screen[1],screen[3],screen[2]].flatMap(p=>{const q=focal-p.z;return [(p.x/w*2-1)*q,(1-p.y/h*2)*q,0,q];});
  gl.bindBuffer(gl.ARRAY_BUFFER,vertices);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);gl.vertexAttribPointer(pos,4,gl.FLOAT,false,0,0);gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return canvas;
 };
}
