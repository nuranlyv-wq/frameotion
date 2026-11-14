// One fixed projective shader; model output supplies only validated scene data.
export function projectivePainter(canvas) {
 const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,preserveDrawingBuffer:true,antialias:false});
 if(!gl)return null;
 const shader=(type,source)=>{const value=gl.createShader(type);gl.shaderSource(value,source);gl.compileShader(value);if(!gl.getShaderParameter(value,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(value));return value;};
 const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec4 position; attribute vec2 uv; varying vec2 texcoord; void main(){gl_Position=position;texcoord=uv;}'));
 gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision highp float; varying vec2 texcoord; uniform sampler2D image; void main(){gl_FragColor=texture2D(image,texcoord);}'));
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const vertices=gl.createBuffer(),uvs=gl.createBuffer(),position=gl.getAttribLocation(program,'position'),uv=gl.getAttribLocation(program,'uv');
 gl.bindBuffer(gl.ARRAY_BUFFER,uvs);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,1,1]),gl.STATIC_DRAW);gl.enableVertexAttribArray(uv);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,0,0);
 gl.enableVertexAttribArray(position);gl.uniform1i(gl.getUniformLocation(program,'image'),0);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);
 const textures=new WeakMap();
 return (node,source,points,matrix,focal)=>{
  gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  let cached=textures.get(node);
  if(cached?.source!==source){
   if(cached)gl.deleteTexture(cached.texture);
   cached={source,texture:gl.createTexture()};textures.set(node,cached);
   gl.bindTexture(gl.TEXTURE_2D,cached.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
  }else gl.bindTexture(gl.TEXTURE_2D,cached.texture);
  const data=[points[0],points[1],points[3],points[2]].flatMap(p=>{
   const x=matrix.a*p.x+matrix.c*p.y+matrix.e,y=matrix.b*p.x+matrix.d*p.y+matrix.f,w=focal-p.z;
   return [(x/canvas.width*2-1)*w,(1-y/canvas.height*2)*w,0,w];
  });
  gl.bindBuffer(gl.ARRAY_BUFFER,vertices);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);gl.vertexAttribPointer(position,4,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  return canvas;
 };
}
