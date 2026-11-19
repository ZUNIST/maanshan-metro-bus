// 重建 js/geo-index.js（地名库更新后索引过期）
import { geoIndex } from './geo-index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await geoIndex(root, true);
console.log('geo-index rebuilt at', path.join(root, 'js/geo-index.js'));
