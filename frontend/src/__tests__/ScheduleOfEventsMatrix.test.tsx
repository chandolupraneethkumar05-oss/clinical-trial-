import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ScheduleOfEventsMatrix } from '../components/ScheduleOfEventsMatrix';
import type { Visit } from '../types/protocol';

describe('ScheduleOfEventsMatrix dynamic procedure coverage', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders both standard catalog procedures and custom assessments outside hardcoded patterns', () => {
    const visits: Visit[] = [
      {
        visit_id: 'V-01',
        week_number: -2,
        visit_name: 'Screening',
        is_mandatory: true,
        inpatient_stay: false,
        procedures: [
          {
            name: 'Vital Signs & Performance Status',
            category: 'non_invasive',
            invasiveness_weight: 1.0,
            estimated_duration_minutes: 15,
            fasting_required: false,
          },
          {
            name: 'Echocardiogram (ECHO LVEF)',
            category: 'minimally_invasive',
            invasiveness_weight: 3.0,
            estimated_duration_minutes: 35,
            fasting_required: false,
          },
        ],
      },
    ];

    render(
      <ScheduleOfEventsMatrix
        visits={visits}
        peakWeeks={[]}
        onSelectVisit={vi.fn()}
        onSelectProcedure={vi.fn()}
      />
    );

    expect(screen.getByText(/Vital Signs & ECOG Performance Status/i)).toBeTruthy();
    expect(screen.getByText(/6\. Additional Protocol Assessments/i)).toBeTruthy();
    expect(screen.getByText(/Echocardiogram \(ECHO LVEF\)/i)).toBeTruthy();
  });
});
