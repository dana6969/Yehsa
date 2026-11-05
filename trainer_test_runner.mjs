
// Yehsa Trainer Test Runner
import { trainIntent } from './yesha_modules/core/trainers/intent_trainer.js';
import { trainMemory } from './yesha_modules/core/trainers/memory_trainer.js';
import { trainPattern } from './yesha_modules/core/trainers/pattern_trainer.js';
import { trainSymbol } from './yesha_modules/core/trainers/symbolic_trainer.js';
import { trainSymbolMap } from './yesha_modules/core/trainers/symbol_map_trainer.js';
import { trainAGI } from './yesha_modules/core/trainers/AGITrainer.js';
import { trainEventLink } from './yesha_modules/core/trainers/eventlink_trainer.js';
import { trainFeedback } from './yesha_modules/core/trainers/feedback_trainer.js';

console.log('🔧 Running Yehsa Trainer Tests...');

trainIntent('Understand symbolic pathways');
trainMemory('SymbolMap is the core of recall logic');
trainPattern('Yehsa must detect structured loops');
trainSymbol('⚛️');
trainSymbolMap({ map: '🧠↔️🕸️', logic: 'symmetric' });
trainAGI('Reflect and reason');
trainEventLink('Loop closed from input to output');
trainFeedback('Positive recognition');

console.log('✅ All trainer functions executed.');

