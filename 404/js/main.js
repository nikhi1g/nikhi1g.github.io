import {initTheme} from './theme.js';
import {initClipboard} from './clipboard.js';
import {initReturnHome} from './return-home.js';
import {initVersionWatcher} from './version.js';
import {createDot} from './physics.js';
import {initFigure} from './figure.js';

initTheme();
initClipboard();
initReturnHome();

const dot = createDot();
initFigure(dot);
dot.start();

initVersionWatcher();
