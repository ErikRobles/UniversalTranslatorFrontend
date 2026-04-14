export type BackendConversationState =
  | 'waiting_to_start'
  | 'awaiting_speaker'
  | 'processing'
  | 'playback_output'
  | 'turn_complete'
  | 'repeat_required'
  | 'low_confidence'
  | 'no_result'
  | 'error'

export type UiSessionState =
  | 'waiting_to_start'
  | 'your_turn_speaking'
  | 'other_speaker_active'
  | 'processing'
  | 'playback_output'
  | 'turn_complete'
  | 'repeat_required'
  | 'low_confidence'
  | 'no_result'
  | 'ended'
  | 'error'

export type SpeakerRole = 'A' | 'B'

export interface ConversationDirection {
  source_speaker_role: SpeakerRole
  target_speaker_role: SpeakerRole
  source_profile_id: string
  target_profile_id: string
  source_locale_code: string
  target_locale_code: string
  source_display_name: string
  target_display_name: string
}

export interface TranscriptItem {
  interaction_id: string
  interaction_sequence: number
  content_id: string
  content_sequence: number
  speaker_role: SpeakerRole
  source_text: string
  content_status: 'pending' | 'finalized'
  interpretation_id: string | null
  interpretation_status: 'requested' | 'processing' | 'succeeded' | 'repeat_requested' | 'low_confidence' | 'no_guess' | 'failed' | null
  interpretation_result_type: 'success' | 'low_confidence' | 'no_guess' | 'failed' | null
  interpreted_text: string | null
  playback_status: string | null
  created_at: string
  completed_at: string | null
}

export interface ConversationView {
  session_id: string
  session_status: 'created' | 'ready' | 'active' | 'ended'
  backend_state: BackendConversationState
  current_turn_speaker: SpeakerRole
  can_submit_turn: boolean
  current_direction: ConversationDirection
  speaker_a_profile_id: string
  speaker_b_profile_id: string
  transcript: TranscriptItem[]
}
