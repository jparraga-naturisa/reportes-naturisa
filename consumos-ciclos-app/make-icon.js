const { createCanvas } = require('canvas');
const fs = require('fs');

function makeIcon(size) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  const s = size;

  // Fondo degradado azul marino
  const grad = ctx.createLinearGradient(0, 0, s, s);
  grad.addColorStop(0, '#0f2444');
  grad.addColorStop(1, '#1e3a5f');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(0, 0, s, s, s * 0.22);
  ctx.fill();

  // Ola decorativa abajo
  ctx.fillStyle = 'rgba(59,130,246,0.18)';
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.88, s * 0.7, s * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  // Caja/crate (insumos) — centro
  const bx = s * 0.22, by = s * 0.34, bw = s * 0.56, bh = s * 0.38;
  const r = s * 0.06;

  // Sombra
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = s * 0.06;
  ctx.shadowOffsetY = s * 0.03;

  // Cuerpo caja
  ctx.fillStyle = '#3b82f6';
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, r);
  ctx.fill();

  // Tapa caja
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#60a5fa';
  ctx.beginPath();
  ctx.roundRect(bx - s*0.02, by - s*0.07, bw + s*0.04, s*0.1, r);
  ctx.fill();

  // Lineas de la caja
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = s * 0.015;
  // vertical center
  ctx.beginPath();
  ctx.moveTo(s * 0.5, by);
  ctx.lineTo(s * 0.5, by + bh);
  ctx.stroke();
  // horizontal center
  ctx.beginPath();
  ctx.moveTo(bx, by + bh * 0.5);
  ctx.lineTo(bx + bw, by + bh * 0.5);
  ctx.stroke();

  // Camarón pequeño encima
  ctx.font = `${s * 0.2}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = s * 0.03;
  ctx.fillText('🦐', s * 0.5, s * 0.18);
  ctx.shadowBlur = 0;

  // Texto "CI" abajo
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${s * 0.1}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('INSUMOS', s * 0.5, s * 0.82);

  return c.toBuffer('image/png');
}

// 1024x1024 app icon
fs.writeFileSync('./assets/icon.png', makeIcon(1024));
// 1024x1024 adaptive foreground (sin fondo redondeado)
const c2 = createCanvas(1024, 1024);
const ctx2 = c2.getContext('2d');
const grad2 = ctx2.createLinearGradient(0,0,1024,1024);
grad2.addColorStop(0,'#0f2444'); grad2.addColorStop(1,'#1e3a5f');
ctx2.fillStyle = grad2; ctx2.fillRect(0,0,1024,1024);
fs.writeFileSync('./assets/android-icon-background.png', c2.toBuffer('image/png'));

const fg = createCanvas(1024,1024);
const fctx = fg.getContext('2d');
// solo los elementos sin fondo
fctx.font = '200px serif'; fctx.textAlign='center'; fctx.textBaseline='middle';
fctx.fillText('🦐', 512, 300);
fctx.fillStyle='#3b82f6';
fctx.beginPath(); fctx.roundRect(220,380,584,380,60); fctx.fill();
fctx.fillStyle='#60a5fa';
fctx.beginPath(); fctx.roundRect(200,305,624,100,60); fctx.fill();
fctx.strokeStyle='rgba(255,255,255,0.25)'; fctx.lineWidth=15;
fctx.beginPath(); fctx.moveTo(512,380); fctx.lineTo(512,760); fctx.stroke();
fctx.beginPath(); fctx.moveTo(220,570); fctx.lineTo(804,570); fctx.stroke();
fctx.fillStyle='#fff'; fctx.font='bold 100px sans-serif';
fctx.fillText('INSUMOS', 512, 840);
fs.writeFileSync('./assets/android-icon-foreground.png', fg.toBuffer('image/png'));
fs.writeFileSync('./assets/android-icon-monochrome.png', fg.toBuffer('image/png'));

console.log('Icons generated!');
