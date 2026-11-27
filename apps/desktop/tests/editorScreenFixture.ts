import { screen } from '@testing-library/react';
import {
  installDesktopApi,
  projectSummary,
} from '@evidence-poc/desktop-testing/desktopApi';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';

export const readyProject = (document = createDesktopFixture()) =>
  installDesktopApi({
    openResult: {
      success: true,
      project: projectSummary({ name: '桌面端夹具（Desktop Fixture）' }),
      document,
      issues: [],
    },
  });

export const readyCanvas = () => screen.findByText('业务旅程画布');
