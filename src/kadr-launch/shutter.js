// Average in shader float precision, quantize once. Canvas lighter + alpha=1/N
// quantizes every sample first and creates N-level bands in soft gradients.
export function createShutter(width,height,count) {
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const gl=canvas.getContext('webgl',{alpha:false,preserveDrawingBuffer:true,antialias:false});
 if(gl && count<=gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)) {
  const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;};
  const program=gl.createProgram();
  gl.attachShader(program,compile(gl.VERTEX_SHADER,'attribute vec2 position; varying vec2 uv;void main(){uv=position;gl_Position=vec4(position.x*2.0-1.0,1.0-position.y*2.0,0.0,1.0);}'));
  const declarations=Array.from({length:count},(_,i)=>`uniform sampler2D image${i};`).join('');
  const sum=Array.from({length:count},(_,i)=>`texture2D(image${i},uv)`).join('+');
  gl.attachShader(program,compile(gl.FRAGMENT_SHADER,`precision highp float;varying vec2 uv;${declarations}void main(){vec4 color=(${sum})/${count}.0;float noise=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-0.5;gl_FragColor=vec4(color.rgb+noise/255.0,1.0);}`));
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
  const position=gl.getAttribLocation(program,'position'),buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,1,1]),gl.STATIC_DRAW);gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  const textures=Array.from({length:count},(_,i)=>{const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.uniform1i(gl.getUniformLocation(program,`image${i}`),i);return texture;});
  return {canvas,mode:'gpu-float-average',sample(source,index){gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,textures[index]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);},finish(){gl.viewport(0,0,width,height);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}};
 }
 // Same numerical contract without WebGL, with bounded integer accumulation.
 const fallback=document.createElement('canvas');fallback.width=width;fallback.height=height;
 const context=fallback.getContext('2d'),sums=new Uint32Array(width*height*4),pixels=context.createImageData(width,height);
 return {canvas:fallback,mode:'cpu-integer-average',sample(source,index){if(index===0)sums.fill(0);const data=source.getContext('2d').getImageData(0,0,width,height).data;for(let i=0;i<data.length;i++)sums[i]+=data[i];},finish(){for(let i=0;i<sums.length;i++)pixels.data[i]=Math.round(sums[i]/count);context.putImageData(pixels,0,0);}};
}
