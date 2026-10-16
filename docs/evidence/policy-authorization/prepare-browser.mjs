import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {preparePolicyReviewFixture} from '/Users/black/Documents/ChatGPT/DeepSeek-RSI/scripts/policy-review-fixture.ts';
const root=mkdtempSync(resolve('.cache/policy-authorization-ui-')); const home=join(root,'policy-review-home');
mkdirSync(join(home,'workspace'),{recursive:true});mkdirSync(join(home,'profiles/web'),{recursive:true});
writeFileSync(join(home,'profiles/web/package.json'),JSON.stringify({name:'dsh-profile-web',private:true,dependencies:{},dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app'],patchReload:'startup'}}}));
writeFileSync(join(home,'profiles/web/cordis.patch.yml'),'[]');
writeFileSync(join(root,'patch.json'),JSON.stringify([{id:'webserver',config:{port:0,host:'127.0.0.1'}},{id:'llm-deepseek',disabled:true},{insert:[{id:'rsi-g0',name:resolve('dist/index.js')},{id:'rsi-policy-fixture',name:resolve('.cache/policy-review-browser-fixture.js')}]}]));
const result=await preparePolicyReviewFixture(join(home,'rsi/g0.sqlite'));writeFileSync(join(root,'prepared.json'),JSON.stringify(result,null,2));writeFileSync('/tmp/rsi-policy-authorization-ui-root',root);console.log(root);
