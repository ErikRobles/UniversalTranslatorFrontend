import { describe, expect, it } from 'vitest'

import { mapBackendStateToUiState, resolveSubmissionSpeakerRole } from './useSessionState'
import type { ConversationView } from '../types/session'

const repeatRequiredView: ConversationView = {
  session_id: 'session-1',
  session_status: 'active',
  backend_state: 'repeat_required',
  current_turn_speaker: 'A',
  can_submit_turn: true,
  current_direction: {
    source_speaker_role: 'A',
    target_speaker_role: 'B',
    source_profile_id: 'lp-es-mx',
    target_profile_id: 'lp-en-us',
    source_locale_code: 'es-MX',
    target_locale_code: 'en-US',
    source_display_name: 'Spanish (Mexico)',
    target_display_name: 'English (US)',
  },
  speaker_a_profile_id: 'lp-es-mx',
  speaker_b_profile_id: 'lp-en-us',
  transcript: [
    {
      interaction_id: 'interaction-1',
      interaction_sequence: 1,
      content_id: 'utt-repeat',
      content_sequence: 1,
      speaker_role: 'A',
      source_text: 'Subtítulos realizados por la comunidad de Amara.org',
      content_status: 'finalized',
      interpretation_id: 'attempt-1',
      interpretation_status: 'repeat_requested',
      interpretation_result_type: null,
      interpreted_text: 'Favor de repetirlo más despacio.',
      playback_status: 'completed',
      created_at: '2026-04-11T00:00:00Z',
      completed_at: '2026-04-11T00:00:01Z',
    },
  ],
}

describe('mapBackendStateToUiState', () => {
  it('preserves backend repeat_required over stale transient processing', () => {
    expect(mapBackendStateToUiState(repeatRequiredView, 'A', 'processing')).toBe('repeat_required')
  })

  it('preserves backend repeat_required over stale transient turn_complete', () => {
    expect(mapBackendStateToUiState(repeatRequiredView, 'A', 'turn_complete')).toBe('repeat_required')
  })

  it('uses backend current speaker for repeat_required submission even when participant role is stale', () => {
    expect(resolveSubmissionSpeakerRole(repeatRequiredView, 'B')).toBe('A')
  })
})
