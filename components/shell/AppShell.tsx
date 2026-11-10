import type { ReactNode } from 'react';
import type { ShellData } from '@/lib/types';
import { ShellFrame } from './ShellFrame';

/**
 * The framed-sheet app shell: a tinted L-frame (sidebar and top bar) around a white sheet.
 * Pages inside render only their sheet content, starting with the title row.
 */
export function AppShell({ data, children }: { data: ShellData; children: ReactNode }) {
  return <ShellFrame data={data}>{children}</ShellFrame>;
}
