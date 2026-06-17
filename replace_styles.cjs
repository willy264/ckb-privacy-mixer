const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'frontend', 'src', 'App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace rounded classes with rounded-none
content = content.replace(/rounded-(sm|md|lg|xl|2xl|3xl|full)/g, 'rounded-none');

// Replace standard tailwind gradients with a flat color
// e.g. bg-gradient-to-br from-brand-primary/10 to-transparent -> bg-brand-primary/10
// e.g. bg-gradient-to-r from-brand-primary to-brand-secondary -> bg-brand-primary
content = content.replace(/bg-gradient-to-[a-z]+\s+from-brand-primary\/([0-9]+)\s+to-[a-zA-Z0-9/-]+/g, 'bg-brand-primary/$1');
content = content.replace(/bg-gradient-to-[a-z]+\s+from-brand-primary\s+to-[a-zA-Z0-9/-]+/g, 'bg-brand-primary');
content = content.replace(/bg-gradient-to-[a-z]+\s+from-brand-secondary\s+to-[a-zA-Z0-9/-]+/g, 'bg-brand-primary');

// Replace any remaining bg-gradient-to-* with bg-brand-primary
content = content.replace(/bg-gradient-to-[a-z]+\s+from-[a-zA-Z0-9/-]+\s+to-[a-zA-Z0-9/-]+/g, 'bg-brand-primary');

fs.writeFileSync(filePath, content, 'utf8');
console.log('App.tsx updated.');
