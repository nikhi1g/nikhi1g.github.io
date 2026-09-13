import {initTheme} from './theme.js';
import {initClipboard} from './clipboard.js';
import {initReturnHome} from './return-home.js';
import {initVersionWatcher} from './version.js';
import {createDot} from './physics.js';
import {initFigure} from './figure.js';
import {createGait} from './gait.js';
import {createDamage} from './damage.js';
import {createCreature} from './creature.js';

initTheme();
initClipboard();
initReturnHome();

const dot = createDot();
initFigure(dot);

const gait = createGait(dot);
const damage = createDamage(dot);
createCreature({dot, gait, damage}).start();

dot.start();

initVersionWatcher();
