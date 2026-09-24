import type { JevDecision, JevGameState } from '../ai/types';
import { pick } from '../i18n';

export function updateDecisionPanel(state: JevGameState, decision: JevDecision | null, message: string): void {
  const panel = document.querySelector<HTMLDivElement>('#decision-panel');
  if (!panel) {
    return;
  }

  const probabilities = decision?.probabilities
    ? Object.entries(decision.probabilities)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(
          ([action, probability], index) => `
            <div class="flex items-center justify-between border-2 ${probabilityClass(index)} px-2 py-1 font-mono text-xs font-black uppercase">
              <span>${action}</span>
              <strong>${(probability * 100).toFixed(0)}%</strong>
            </div>
          `,
        )
        .join('')
    : `<div class="border-2 border-slate-600 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-300">${pick('No distribution yet', 'Sin distribución aún')}</div>`;

  panel.innerHTML = `
    <div class="flex h-full min-h-0 flex-col text-white">
      <div class="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 class="font-mono text-lg font-black uppercase leading-none text-fuchsia-300">${pick('Jev Debug', 'Debug de Jev')}</h2>
          <p class="mt-1 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-300">${pick('structured decision trace', 'traza estructurada de decisión')}</p>
        </div>
        <span class="border-2 border-yellow-300 bg-yellow-300 px-2.5 py-1 font-mono text-[10px] font-black uppercase text-slate-950">
          ${decision?.source ?? 'waiting'}
        </span>
      </div>

      <div class="grid grid-cols-4 gap-2">
        ${stat(pick('Turn', 'Turno'), state.turn, 'border-cyan-300 bg-cyan-300 text-slate-950')}
        ${stat('HP', state.player.hp, 'border-emerald-400 bg-emerald-400 text-slate-950')}
        ${stat(pick('Relics', 'Reliquias'), state.player.coins, 'border-orange-400 bg-orange-400 text-slate-950')}
        ${stat(pick('Pots', 'Pociones'), state.player.potions, 'border-purple-400 bg-purple-500 text-white')}
      </div>

      <div class="my-3 border-4 border-cyan-300 bg-slate-900 p-3 shadow-[4px_4px_0_#06b6d4]">
        <p class="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">${pick('Last decision', 'Última decisión')}</p>
        <p class="mt-1 font-mono text-xl font-black uppercase text-white">${decision?.action ?? pick('WAITING_FOR_JEV', 'ESPERANDO_A_JEV')}</p>
        <p class="mt-1 font-mono text-xs font-bold text-slate-300">${pick('Confidence', 'Confianza')}: <strong class="text-yellow-300">${decision ? `${(decision.confidence * 100).toFixed(0)}%` : '-'}</strong></p>
      </div>

      <div class="grid grid-cols-2 gap-2 text-xs">
        <section class="border-2 border-blue-400 bg-slate-900 p-2">
          <h3 class="mb-1 font-mono font-black uppercase text-blue-300">${pick('Memory', 'Memoria')}</h3>
          <p class="font-mono text-slate-300">${pick('Loop', 'Bucle')}: <strong class="text-white">${state.loopWarning ? pick('yes', 'sí') : 'no'}</strong></p>
          <p class="mt-1 truncate font-mono text-[11px] text-slate-300">${state.recentActions.slice(-4).join(' → ') || '-'}</p>
        </section>
        <section class="border-2 border-emerald-400 bg-slate-900 p-2">
          <h3 class="mb-1 font-mono font-black uppercase text-emerald-300">${pick('Path', 'Ruta')}</h3>
          <div class="grid grid-cols-2 gap-x-2 font-mono text-[11px] text-slate-300">
            <span>${pick('Enemy', 'Enemigo')}</span><strong class="text-right text-red-300">${state.nearest.enemy.direction}/${state.nearest.enemy.distance ?? '-'}</strong>
            <span>${pick('Potion', 'Poción')}</span><strong class="text-right text-emerald-300">${state.nearest.potion.direction}/${state.nearest.potion.distance ?? '-'}</strong>
            <span>${pick('Relic', 'Reliquia')}</span><strong class="text-right text-orange-300">${state.nearest.coin.direction}/${state.nearest.coin.distance ?? '-'}</strong>
            <span>${pick('Exit', 'Salida')}</span><strong class="text-right text-purple-300">${state.nearest.exit.direction}/${state.nearest.exit.distance ?? '-'}</strong>
          </div>
        </section>
      </div>

      <section class="mt-3 min-h-0 flex-1 border-2 border-yellow-300 bg-slate-900 p-2">
        <h3 class="mb-2 font-mono text-xs font-black uppercase text-yellow-300">${pick('Top probabilities', 'Probabilidades principales')}</h3>
        <div class="grid gap-1">${probabilities}</div>
      </section>

      <p class="mt-3 border-2 border-slate-600 bg-slate-900 p-2 font-mono text-xs font-bold leading-5 text-slate-200">${message}</p>
    </div>
  `;
}

function stat(label: string, value: number, colorClass: string): string {
  return `
    <div class="border-2 ${colorClass} p-2 font-mono shadow-[3px_3px_0_#0f172a]">
      <p class="text-[9px] font-black uppercase tracking-wide opacity-80">${label}</p>
      <strong class="text-sm font-black">${value}</strong>
    </div>
  `;
}

function probabilityClass(index: number): string {
  return [
    'border-fuchsia-400 bg-fuchsia-500 text-white',
    'border-cyan-300 bg-cyan-300 text-slate-950',
    'border-yellow-300 bg-yellow-300 text-slate-950',
  ][index] ?? 'border-slate-600 bg-slate-900 text-slate-300';
}
