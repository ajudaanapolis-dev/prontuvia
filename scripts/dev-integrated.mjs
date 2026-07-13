import { spawn } from "node:child_process";

const services=[
  {name:"API",args:["run","dev"]},
  {name:"GESTÃO",args:["run","dev:web"]},
  {name:"CLÍNICO",args:["run","dev:clinical"]},
];
const colors={API:"\u001b[36m",GESTÃO:"\u001b[32m",CLÍNICO:"\u001b[35m"};
const reset="\u001b[0m";
const children=services.map(service=>{
  const child=spawn("npm",service.args,{cwd:process.cwd(),env:process.env,stdio:["inherit","pipe","pipe"]});
  const forward=(stream,destination)=>stream.on("data",chunk=>destination.write(`${colors[service.name]}[${service.name}]${reset} ${chunk}`));
  forward(child.stdout,process.stdout);forward(child.stderr,process.stderr);
  child.on("exit",code=>{if(code&&code!==0){console.error(`${service.name} encerrou com código ${code}`);shutdown(code);}});
  return child;
});
let stopping=false;
function shutdown(code=0){if(stopping)return;stopping=true;for(const child of children)if(!child.killed)child.kill("SIGTERM");setTimeout(()=>process.exit(code),300);}
process.on("SIGINT",()=>shutdown(0));process.on("SIGTERM",()=>shutdown(0));
console.log("Prontuvia integrado iniciando: http://localhost:5173");
