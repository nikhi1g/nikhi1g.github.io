import {initTheme} from './theme.js';
import {initClipboard} from './clipboard.js';
import {initReturnHome} from './return-home.js';
import {initVersionWatcher} from './version.js';
import {createDot} from './physics.js';
import {initFigure} from './figure.js';
import {createGait} from './gait.js';
import {createDamage} from './damage.js';
import {createStairs} from './stairs.js';
import {createArrow} from './arrow.js';
import {createSaw} from './saw.js';
import {createFishing} from './fishing.js';
import {createCreature} from './creature.js';

initTheme();
initClipboard();
initReturnHome();

const dot = createDot();
const figure = initFigure(dot);

const gait = createGait(dot);
const damage = createDamage(dot);
const stairs = createStairs(dot);
const arrow = createArrow(dot);
const saw = createSaw(dot);
const fishing = createFishing(dot);
createCreature({dot, gait, damage, stairs, saw, fishing, arrow, figure}).start();

dot.start();

initVersionWatcher();
