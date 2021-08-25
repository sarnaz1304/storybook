import { isExportStory, sanitize, Parameters, Framework } from '@storybook/csf';
import { logger } from '@storybook/client-logger';

import {
  ModuleExports,
  CSFFile,
  Path,
  NormalizedComponentAnnotations,
  NormalizedStoriesEntry,
} from './types';
import { autoTitle } from './autoTitle';
import { normalizeStory } from './normalizeStory';
import { normalizeInputTypes } from './normalizeInputTypes';

const checkGlobals = (parameters: Parameters) => {
  const { globals, globalTypes } = parameters;
  if (globals || globalTypes) {
    logger.error(
      'Global args/argTypes can only be set globally',
      JSON.stringify({
        globals,
        globalTypes,
      })
    );
  }
};

const checkStorySort = (parameters: Parameters) => {
  const { options } = parameters;
  if (options?.storySort) logger.error('The storySort option parameter can only be set globally');
};

const checkDisallowedParameters = (parameters: Parameters) => {
  if (!parameters) {
    return;
  }
  checkGlobals(parameters);
  checkStorySort(parameters);
};

// Given the raw exports of a CSF file, check and normalize it.
export function processCSFFile<TFramework extends Framework>(
  moduleExports: ModuleExports,
  path: Path,
  entries: NormalizedStoriesEntry[]
): CSFFile<TFramework> {
  const { default: defaultExport, __namedExportsOrder, ...namedExports } = moduleExports;
  let exports = namedExports;

  const title = autoTitle(defaultExport, path, entries);
  if (!title) {
    throw new Error(
      `Unexpected default export without title: ${JSON.stringify(moduleExports.default)}`
    );
  }

  const { id, argTypes } = defaultExport;
  const meta: NormalizedComponentAnnotations<TFramework> = {
    id: sanitize(id || title),
    ...defaultExport,
    title,
    ...(argTypes && { argTypes: normalizeInputTypes(argTypes) }),
  };
  checkDisallowedParameters(meta.parameters);

  // prefer a user/loader provided `__namedExportsOrder` array if supplied
  // we do this as es module exports are always ordered alphabetically
  // see https://github.com/storybookjs/storybook/issues/9136
  if (Array.isArray(__namedExportsOrder)) {
    exports = {};
    __namedExportsOrder.forEach((name) => {
      if (namedExports[name]) {
        exports[name] = namedExports[name];
      }
    });
  }

  const csfFile: CSFFile<TFramework> = { meta, stories: {} };

  Object.keys(exports).forEach((key) => {
    if (isExportStory(key, meta)) {
      const storyMeta = normalizeStory(key, exports[key], meta);
      checkDisallowedParameters(storyMeta.parameters);

      csfFile.stories[storyMeta.id] = storyMeta;
    }
  });

  return csfFile;
}
