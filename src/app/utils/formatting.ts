import { Step } from '../config/types';

function formatNonCommand(text: string): string {
  return text
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word)
    .join(' ');
}

export function formatSteps(
  steps: Step[], 
  kp: number, 
  distanceSeconds: number,
  runCompleted: boolean = false,
  endsWithTeleportToMarket: boolean = false
): string {
  // If run completed, show completion message with preserved metrics
  if (runCompleted) {
    const completionText = endsWithTeleportToMarket 
      ? `<b style="color: rgb(165,105,189)">TELE</b> Market → Done 💰`
      : 'Done 💰';
    if (kp > 0 && !isNaN(distanceSeconds)) {
      const distance = distanceSeconds;
      const minutes = Math.floor(distance / 60);
      const seconds = distance - minutes * 60;
      const timeInfo = `[${minutes}m ${seconds.toFixed(0)}s | KP = ${(kp / 100).toFixed(2)} | KP/D = ${(kp / Math.max(1, distance)).toFixed(2)}]`;
      return `${timeInfo}\n${completionText}`;
    } else {
      return completionText;
    }
  }
  
  // If no steps and no KP, show initial message
  if (steps.length === 0 && kp === 0) {
    return 'No bounty board or active bounties detected.';
  }

  const distance = distanceSeconds;
  const minutes = Math.floor(distance / 60);
  const seconds = distance - minutes * 60;

  const tokens: string[] = [];
  let i = 0;

  while (i < steps.length) {
    const step = steps[i] as any;
    if (step?.type === 'buy') {
      // Find the end of the consecutive buy sequence
      let buySequenceEnd = i;
      while (buySequenceEnd < steps.length && (steps[buySequenceEnd] as any)?.type === 'buy') {
        buySequenceEnd++;
      }
      
      // Count occurrences of each item in this buy sequence
      const itemCounts = new Map<string, number>();
      for (let j = i; j < buySequenceEnd; j++) {
        const buyStep = steps[j] as any;
        const item = buyStep.item;
        itemCounts.set(item, (itemCounts.get(item) || 0) + 1);
      }
      
      // Format each unique item with its count
      const buyTokens: string[] = [];
      const seenItems = new Set<string>();
      for (let j = i; j < buySequenceEnd; j++) {
        const buyStep = steps[j] as any;
        const item = buyStep.item;
        if (!seenItems.has(item)) {
          seenItems.add(item);
          const count = itemCounts.get(item) || 1;
          const countStr = count > 1 ? `${count}x ` : '';
          buyTokens.push(`<b style="color: rgb(231,76,60)">BUY</b> ${formatNonCommand(`${countStr}${item}`)}`);
        }
      }
      
      tokens.push(...buyTokens);
      i = buySequenceEnd;
    } else if (step?.type === 'sell') {
      let count = 1;
      // Count consecutive sell steps for the same item
      while (i + count < steps.length && (steps[i + count] as any)?.type === 'sell' && (steps[i + count] as any)?.item === step.item) {
        count++;
      }
      
      tokens.push(`<b style="color: rgb(46,204,113)">SELL</b> ${formatNonCommand(step.item)}`);
      i += count;
    } else if (step?.type === 'teleport') {
      let loc = step.location;
      if (loc === 'Crenopolis Market') loc = 'Market';
      else if (loc === 'Crenopolis Outskirts') loc = 'Outskirts';
      tokens.push(`<b style="color: rgb(165,105,189)">TELE</b> ${formatNonCommand(loc)}`);
      i++;
    } else if (step?.type === 'return') {
      tokens.push(formatNonCommand('Done 💰'));
      i++;
    } else {
      i++;
    }
  }

  if (!isNaN(distance)) {
    const timeInfo = `[${minutes}m ${seconds.toFixed(0)}s | KP = ${(kp / 100).toFixed(2)} | KP/D = ${(kp / Math.max(1, distance)).toFixed(2)}]`;
    return `${timeInfo}\n${tokens.join(' → ')}`;
  }
  return tokens.join(' → ');
}
