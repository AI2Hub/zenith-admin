import { registerExport } from '../registry';
import { usersExportDefinition } from './users';
import { reportDatasetExportDefinition } from './report-dataset';

let registered = false;

export function registerExportDefinitions(): void {
  if (registered) return;
  registerExport(usersExportDefinition as unknown as Parameters<typeof registerExport>[0]);
  registerExport(reportDatasetExportDefinition as unknown as Parameters<typeof registerExport>[0]);
  registered = true;
}
