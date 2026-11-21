// 生成主菜单封面：马鞍山「一江两岸」示意路线图（浅色 / 深色两版）
// 用法：node tools/make-cover.mjs   → img/cover-ms-light.svg、img/cover-ms-dark.svg
import { writeFile } from 'node:fs/promises';

const W = 1600, H = 900;

const lines = {
  nm: { c: '#c2456f', name: '宁马线' },
  mz: { c: '#0f7fbf', name: '马郑线' },
  nh: { c: '#a86ab5', name: '宁和线' },
};

// 站点：[x, y, 名称, 线路, 标注方向 l/r/t/b]
const ST = [
  [1258, 118, '慈湖高新区', 'nm', 'r'],
  [1250, 208, '湖北路·二中', 'nm', 'r'],
  [1244, 282, '湖南路·安工大', 'nm', 'r'],
  [1238, 356, '雨山东路', 'nm', 'r'],
  [1232, 428, '阳湖', 'nm', 'r'],
  [1226, 505, '马鞍山经开区', 'nm', 'r'],
  [1186, 618, '姑孰', 'nm', 'r'],
  [1152, 742, '太白', 'nm', 'r'],
  [1112, 556, '马鞍山南', 'mz', 't'],
  [1000, 596, '江心洲', 'mz', 'b'],
  [712, 626, '郑蒲港', 'mz', 'b'],
  [734, 540, '太阳河', 'nh', 'r'],
  [722, 470, '历阳', 'nh', 'r'],
  [706, 404, '海峰路', 'nh', 'r'],
  [686, 336, '和县经开区', 'nh', 'r'],
  [648, 268, '宋桥', 'nh', 'r'],
  [600, 206, '浦和产业园', 'nh', 'r'],
  [548, 146, '高家冲', 'nh', 'r'],
];

const path = {
  nm: 'M1258 118 L1250 208 L1244 282 L1238 356 L1232 428 L1226 505 C1214 548 1200 588 1186 618 C1172 676 1160 710 1152 742',
  mz: 'M1226 505 C1180 520 1146 540 1112 556 C1064 576 1032 590 1000 596 C880 604 800 618 712 626',
  nh: 'M712 626 C714 588 724 566 734 540 C732 500 728 486 722 470 C716 440 710 420 706 404 C698 372 692 354 686 336 C672 304 660 286 648 268 C628 240 614 222 600 206 C580 180 562 162 548 146',
};

const pal = {
  light: {
    bg: '#f4f1ea', grid: '#e6e1d6', river: '#cfe1f0', riverEdge: '#b9d3e7', block: '#e7e2d7',
    ink: '#28313d', sub: '#6d7a8a', panel: '#fbf9f4', halo: '#f4f1ea', bridge: '#b9c6d4',
  },
  dark: {
    bg: '#0f1722', grid: '#18222f', river: '#17293c', riverEdge: '#1d3247', block: '#161f2b',
    ink: '#e6eef8', sub: '#8fa0b4', panel: '#101a26', halo: '#0f1722', bridge: '#2a3b4e',
  },
};

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function cover(k) {
  const p = pal[k];
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice">`);
  parts.push(`<defs>
    <linearGradient id="riv" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.river}"/><stop offset="1" stop-color="${p.riverEdge}"/></linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="${p.grid}" stroke-width="1"/></pattern>
  </defs>`);
  parts.push(`<rect width="${W}" height="${H}" fill="${p.bg}"/>`);
  parts.push(`<rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.55"/>`);
  // 远景山体与城区底块（不抢主线）
  parts.push(`<g fill="${p.block}" opacity="0.9">`);
  const blocks = [[1180, 150, 220, 120], [1210, 300, 250, 160], [1150, 560, 230, 180], [1230, 700, 200, 120],
    [520, 360, 210, 190], [560, 600, 200, 150], [660, 240, 150, 130], [300, 240, 160, 120]];
  for (const [x, y, w, h] of blocks) parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14"/>`);
  parts.push('</g>');
  // 长江：自东北向西南的宽带
  parts.push(`<path d="M958 -60 C936 190 906 420 838 610 C800 728 768 842 756 960 L896 960 C906 840 936 730 972 620 C1040 430 1072 200 1094 -60 Z" fill="url(#riv)"/>`);
  parts.push(`<text x="1010" y="300" fill="${p.sub}" font-family="'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif" font-size="26" letter-spacing="10" opacity="0.7" transform="rotate(78 1010 300)">长　江</text>`);
  // 过江桥（马郑线跨江段）
  parts.push(`<path d="M1010 586 L860 604" stroke="${p.bridge}" stroke-width="14" stroke-linecap="round" opacity="0.9"/>`);
  parts.push(`<path d="M1010 586 L860 604" stroke="${p.halo}" stroke-width="5" stroke-dasharray="12 12" opacity="0.9"/>`);
  // 线路
  for (const id of ['nh', 'nm', 'mz']) {
    parts.push(`<path id="p-${id}" d="${path[id]}" fill="none" stroke="${p.halo}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>`);
    parts.push(`<path d="${path[id]}" fill="none" stroke="${lines[id].c}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  // 车站
  for (const [x, y, name, id, dir] of ST) {
    const col = lines[id].c;
    if (name === '马鞍山经开区' || name === '郑蒲港') {
      parts.push(`<circle cx="${x}" cy="${y}" r="15" fill="${p.panel}" stroke="${col}" stroke-width="8"/>`);
      parts.push(`<circle cx="${x}" cy="${y}" r="5" fill="${col}"/>`);
    } else {
      parts.push(`<circle cx="${x}" cy="${y}" r="9" fill="${p.panel}" stroke="${col}" stroke-width="5"/>`);
    }
    const fs = name.length > 5 ? 21 : 23;
    const anchor = dir === 'l' ? 'end' : dir === 'r' ? 'start' : 'middle';
    const dx = dir === 'l' ? -22 : dir === 'r' ? 22 : 0;
    const dy = dir === 't' ? -26 : dir === 'b' ? 40 : 8;
    parts.push(`<text x="${x + dx}" y="${y + dy}" text-anchor="${anchor}" fill="${p.ink}" font-family="'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif" font-size="${fs}" font-weight="500">${esc(name)}</text>`);
  }
  // 图例
  const ly = 812;
  parts.push(`<g font-family="'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif" font-size="22" fill="${p.sub}">`);
  let lx = 1000;
  for (const id of ['nm', 'mz', 'nh']) {
    parts.push(`<rect x="${lx}" y="${ly - 10}" width="34" height="10" rx="5" fill="${lines[id].c}"/>`);
    parts.push(`<text x="${lx + 46}" y="${ly}" >${lines[id].name}</text>`);
    lx += 46 + lines[id].name.length * 23 + 34;
  }
  parts.push('</g>');
  parts.push('</svg>');
  return parts.join('\n');
}

await writeFile('img/cover-ms-light.svg', cover('light'));
await writeFile('img/cover-ms-dark.svg', cover('dark'));
console.log('cover written');
