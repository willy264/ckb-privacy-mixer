const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'frontend', 'src', 'App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace standard bg-black/40 with bg-[#05000A]/60
content = content.replace(/bg-black\/40/g, 'bg-[#05000A]/60 shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)]');

// Give nested panels a polymorphic shadow
content = content.replace(/bg-brand-primary\/5 border border-brand-primary\/20/g, 'bg-brand-panel/60 border-t border-l border-brand-primary/10 border-b border-r border-black shadow-[0_10px_30px_rgba(0,0,0,0.8)]');

// Fix tabs active state to be deep purple-black
content = content.replace(/bg-white\/\[0\.02\]/g, 'bg-[#0C0018]');

// Update gradient replacement (since I removed gradients entirely in the last step, let's just make sure active states look good)
content = content.replace(/bg-brand-primary\/10/g, 'bg-brand-primary/20 shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)]');

fs.writeFileSync(filePath, content, 'utf8');
console.log('App.tsx updated for polymorphic depth.');
