// Approved UI copy from docs/safety-and-copy.md §2. Use these strings verbatim.
import { APP_NAME } from './config';

export const copy = {
  timelineFooter: (name: string) =>
    `${APP_NAME} is not a medical device and doesn't diagnose anything. It notices changes in how ${name} talks compared with his own usual, which can have many causes. If you're concerned, talk with his doctor.`,
  trendsHeader: (name: string) =>
    `These charts compare each call with ${name}'s own usual. Small ups and downs are normal.`,
  simulatedBadge: 'Simulated',
  simulatedTooltip: 'Demo data created for this presentation, not a real call.',
  notYetConfirmed: (name: string) =>
    `${name} hasn't confirmed sharing yet. You'll see call details after he says yes on a call.`,
  nudgeLinkLabel: "Alzheimer's Association: 10 warning signs",
} as const;
