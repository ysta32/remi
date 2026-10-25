import type { Metadata } from 'next';
import { Archivo } from 'next/font/google';
import './control.css';

// The operator panel has its own face: a switchboard, not the family's sky-blue app.
const archivo = Archivo({ variable: '--font-archivo', subsets: ['latin'], axes: ['wdth'] });

export const metadata: Metadata = { title: 'Remi switchboard', robots: { index: false, follow: false } };

export default function ControlLayout({ children }: LayoutProps<'/control'>) {
  return <div className={`${archivo.variable} switchboard`}>{children}</div>;
}
