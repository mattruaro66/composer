import { useEffect, useRef, useState } from 'react'
import { INSTRUMENTS } from '../instrument'
import { toMidi } from '../theory'
import { getEngine } from '../audio'
import { pulseSeconds } from '../song/schedule'
import { PPQ, sectionBpm } from '../song/model'
import { fingerNote } from '../notation/fingering'
import { songContext } from '../ai/context'
import { applyProposal, describeProposal, type Proposal } from '../ai/proposals'
import { AiError, getSample, insideClaudeViewer, runClaude, testConnection, type ProviderKind } from '../ai/provider'
import { useAi, type ChatMessage } from '../store/ai'
import { useInstrument } from '../store/instrument'
import { useSong } from '../store/song'
import { useUi } from '../store/ui'
import { useDetection, useFormat } from './hooks'
import { playSequence } from './sequence'
import { toast } from './toast'

const QUICK = [
  'Sugira um refrão que contraste com o verso',
  'Crie um solo de 4 compassos sobre a progressão do verso',
  'Escreva a letra do verso sobre ',
  'Rearmonize o verso com sabor de bossa nova',
  'Monte uma música completa em Ré maior, clima de estrada',
  'Explique por que essa progressão funciona',
]

const newId = () => `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`

/** Chat with Claude about the song; proposals come with Listen / Apply / Undo. */
export function ClaudeChat() {
  const messages = useAi((s) => s.messages)
  const apiKey = useAi((s) => s.apiKey)
  const setAi = useAi((s) => s.set)
  const update = useAi((s) => s.update)
  const clear = useAi((s) => s.clear)
  const draft = useUi((s) => s.aiDraft)
  const setUi = useUi((s) => s.set)
  const { chord } = useDetection()
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [provider, setProvider] = useState<ProviderKind | 'checking'>('checking')
  const [keyDraft, setKeyDraft] = useState('')
  const ctl = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let alive = true
    void getSample().then((s) => alive && setProvider(s ? 'claude-app' : 'api'))
    return () => {
      alive = false
    }
  }, [])
  useEffect(() => {
    if (draft) {
      setInput(draft)
      setUi({ aiDraft: null })
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [draft, setUi])
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const needsKey = provider === 'api' && !apiKey

  const speed = useAi((s) => s.speed)
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const runTest = async () => {
    if (provider === 'checking') return
    setTestMsg('Testando…')
    try {
      const secs = await testConnection(provider, apiKey)
      setTestMsg(`Conexão OK: o Claude respondeu em ${secs.toFixed(1)} s.`)
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError('Falha no teste.', 'unknown')
      setTestMsg(`${err.message} (código: ${err.code})`)
    }
  }

  const send = async (text: string, opts: { noTools?: boolean } = {}) => {
    const request = text.trim()
    if (!request || busy || provider === 'checking' || needsKey) return
    const { song, activeSectionId } = useSong.getState()
    const inst = useInstrument.getState()
    const def = INSTRUMENTS[inst.instrumentId]
    const context = songContext(song, { activeSectionId, instrument: def.name, tuning: def.kind === 'strings' ? inst.tuning : [], capo: inst.capo, selectedChord: chord?.symbol })
    const history = useAi.getState().messages.filter((m) => !m.error && m.text.trim()).map((m) => ({
      role: m.role,
      content: m.role === 'assistant' && m.proposals.length ? `${m.text}\n${m.proposals.map(describeProposal).join('\n')}` : m.text,
    }))
    const userMsg: ChatMessage = { id: newId(), role: 'user', text: request, proposals: [] }
    const reply: ChatMessage = { id: newId(), role: 'assistant', text: '', proposals: [], pending: true, startedAt: Date.now(), request }
    setAi({ messages: [...useAi.getState().messages, userMsg, reply] })
    setInput('')
    setBusy(true)
    ctl.current = new AbortController()
    const proposals: Proposal[] = []
    try {
      const final = await runClaude(provider as ProviderKind, apiKey, {
        history,
        request,
        context,
        signal: ctl.current.signal,
        speed: useAi.getState().speed,
        noTools: opts.noTools,
        onText: (t) => update(reply.id, { text: t }),
        onProposal: (p) => {
          proposals.push(p)
          update(reply.id, { proposals: [...proposals] })
        },
      })
      update(reply.id, { text: final || (proposals.length ? '' : 'Pronto.'), pending: false })
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError('Algo deu errado ao falar com o Claude.', 'unknown')
      update(reply.id, { text: err.partial ?? useAi.getState().messages.find((m) => m.id === reply.id)?.text ?? '', error: err.code === 'cancelled' ? undefined : err.message, errorCode: err.code, pending: false })
    } finally {
      setBusy(false)
      ctl.current = null
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 text-sm" data-testid="claude-chat">
      <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
        <span className={`h-2 w-2 rounded-full ${provider === 'checking' ? 'animate-pulse bg-sky-400' : needsKey ? 'bg-amber-400' : 'bg-emerald-400'}`} />
        <span data-testid="claude-provider">
          {provider === 'checking' ? 'Conectando…' : provider === 'claude-app' ? 'Usando sua conta do Claude (claude.ai)' : apiKey ? 'Conectado pela API com a sua chave (Claude Opus 5.5)' : insideClaudeViewer() ? 'O claude.ai não liberou o Claude nesta página: use uma chave da API' : 'Precisa de uma chave da API do Claude'}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <select className="field py-0.5 text-xs" value={speed} onChange={(e) => setAi({ speed: e.target.value as 'quick' | 'full' })} aria-label="Velocidade" title="Rápido responde em segundos; Completo pensa mais e demora até 1–2 min" data-testid="claude-speed">
            <option value="quick">Rápido</option>
            <option value="full">Completo</option>
          </select>
          <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => void runTest()} disabled={provider === 'checking' || needsKey} data-testid="claude-test">
            Testar conexão
          </button>
          {provider === 'api' && apiKey && (
            <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setAi({ apiKey: '' })}>
              Trocar chave
            </button>
          )}
          <button className="btn-ghost px-2 py-0.5 text-xs" onClick={clear} disabled={!messages.length || busy}>
            Limpar conversa
          </button>
        </div>
      </div>

      {testMsg && (
        <p className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--surface-2)' }} data-testid="claude-test-result" role="status">
          {testMsg}
        </p>
      )}

      {needsKey && (
        <form
          className="panel flex flex-col gap-2 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (keyDraft.trim().startsWith('sk-')) {
              setAi({ apiKey: keyDraft.trim() })
              setKeyDraft('')
            }
          }}
          data-testid="claude-key-form"
        >
          <p className="text-[var(--muted)]">
            Para usar o Claude no app, cole uma chave da API (crie em <span className="select-all text-[var(--fg)]">console.anthropic.com</span>). Ela fica guardada só neste navegador e é enviada apenas para a API do Claude.
          </p>
          <div className="flex gap-2">
            <input id="claude-key" className="field flex-1" type="password" autoComplete="off" placeholder="sk-ant-…" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} aria-label="Chave da API do Claude" />
            <button className="btn btn-primary" type="submit" disabled={!keyDraft.trim().startsWith('sk-')}>
              Salvar
            </button>
          </div>
          <p className="text-xs text-[var(--faint)]">No link de teste dentro do claude.ai não precisa de chave: o Claude usa a sua conta.</p>
        </form>
      )}

      <div ref={listRef} className="flex min-h-[120px] flex-1 flex-col gap-3 overflow-y-auto pr-1" data-testid="claude-messages">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2 text-[var(--muted)]">
            <p>
              Peça progressões, solos, melodias, letras ou uma música inteira. O Claude lê o estado atual da sua música e entrega propostas para você <b className="text-[var(--fg)]">ouvir</b> e <b className="text-[var(--fg)]">aplicar</b>; nada muda sem você.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <Message key={m.id} m={m} onRetry={(noTools) => m.request && void send(m.request, { noTools })} busy={busy} />
        ))}
      </div>

      <div className={`flex flex-wrap gap-1.5 ${messages.length ? 'hidden' : ''}`}>
        {QUICK.map((q) => (
          <button key={q} className="chip px-2.5 py-1 hover:bg-[var(--surface-3)]" onClick={() => (q.endsWith(' ') ? (setInput(q), inputRef.current?.focus()) : void send(q))} disabled={busy || needsKey}>
            {q.trim()}
            {q.endsWith(' ') ? '…' : ''}
          </button>
        ))}
      </div>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void send(input)
        }}
      >
        <textarea
          ref={inputRef}
          id="claude-input"
          className="field min-h-[44px] flex-1 resize-y"
          rows={2}
          placeholder={needsKey ? 'Salve a chave acima para conversar' : 'Ex.: crie uma ponte em Lá menor que leve de volta ao refrão'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(input)
            }
            e.stopPropagation()
          }}
          aria-label="Mensagem para o Claude"
          data-testid="claude-input"
        />
        {busy ? (
          <button type="button" className="btn" onClick={() => ctl.current?.abort()} data-testid="claude-stop">
            ■ Parar
          </button>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={!input.trim() || needsKey || provider === 'checking'} data-testid="claude-send">
            Enviar
          </button>
        )}
      </form>
    </div>
  )
}

function Elapsed({ since }: { since?: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const secs = since ? Math.max(0, Math.round((now - since) / 1000)) : 0
  return (
    <span className="animate-pulse text-[var(--muted)]" data-testid="claude-thinking">
      Pensando… {secs} s{secs > 8 ? ' · na primeira vez o claude.ai pede permissão (confira se apareceu uma janela); propostas podem levar até 1 min' : ''}
    </span>
  )
}

function Message({ m, onRetry, busy }: { m: ChatMessage; onRetry: (noTools: boolean) => void; busy: boolean }) {
  if (m.role === 'user')
    return (
      <div className="ml-8 self-end rounded-2xl rounded-br-md px-3 py-2" style={{ background: 'rgba(245,165,36,0.14)', boxShadow: 'inset 0 0 0 1px rgba(245,165,36,0.3)' }}>
        {m.text}
      </div>
    )
  return (
    <div className="flex flex-col gap-2" data-testid="claude-reply">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold" style={{ background: '#d97757', color: '#fff' }} aria-hidden>
          ✳
        </span>
        <div className="min-w-0 flex-1 whitespace-pre-wrap leading-relaxed">
          {m.text || (m.pending ? <Elapsed since={m.startedAt} /> : null)}
          {m.error && (
            <div className="mt-1 flex flex-col gap-1.5" data-testid="claude-error">
              <p className="text-[var(--danger)]">
                {m.error} <span className="text-xs text-[var(--faint)]">(código: {m.errorCode ?? '—'})</span>
              </p>
              {m.request && m.errorCode !== 'not_granted' && m.errorCode !== 'sampling_disabled' && (
                <div className="flex gap-1.5">
                  <button className="btn py-1 text-xs" onClick={() => onRetry(false)} disabled={busy}>
                    Tentar de novo
                  </button>
                  <button className="btn py-1 text-xs" onClick={() => onRetry(true)} disabled={busy} data-testid="claude-retry-plain">
                    Tentar sem ferramentas (só texto)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {m.proposals.map((p) => (
        <ProposalCard key={p.id} p={p} />
      ))}
    </div>
  )
}

const KIND_LABEL: Record<Proposal['kind'], string> = { progression: 'Progressão', melody: 'Melodia / solo', lyrics: 'Letra', song: 'Música completa' }

function ProposalCard({ p }: { p: Proposal }) {
  const fmt = useFormat()
  const applied = useAi((s) => p.id in s.applied)
  const setAi = useAi((s) => s.set)

  const listen = async () => {
    if (p.kind === 'progression') void playSequence(p.chords)
    else if (p.kind === 'song') void playSequence(p.sections[0]?.chords ?? [])
    else if (p.kind === 'melody') {
      const e = await getEngine()
      e.stopAll()
      const { song, activeSectionId } = useSong.getState()
      const sec = song.sections.find((s) => s.id === activeSectionId)
      const quarter = pulseSeconds(sectionBpm(song, sec), song.bpmUnit, 4)
      const t0 = e.now() + 0.05
      for (const n of p.notes) e.playNote(n.midi, { time: t0 + (n.start / PPQ) * quarter, duration: (n.duration / PPQ) * quarter, velocity: 0.8 })
    }
  }
  const apply = () => {
    const { song, activeSectionId, setSong, setActiveSection } = useSong.getState()
    const inst = useInstrument.getState()
    const def = INSTRUMENTS[inst.instrumentId]
    const tuning = inst.tuning.map((n) => toMidi(n) ?? 40)
    const finger = def.kind === 'strings' ? (m: number) => fingerNote(m, tuning, inst.capo, def.frets) ?? {} : undefined
    const r = applyProposal(song, activeSectionId, p, finger)
    setAi({ applied: { ...useAi.getState().applied, [p.id]: song } })
    setSong(r.song)
    setActiveSection(r.activeSectionId)
    toast(r.summary, 'ok')
  }
  const undo = () => {
    const snap = useAi.getState().applied[p.id]
    if (!snap) return
    useSong.getState().setSong(snap)
    const rest = { ...useAi.getState().applied }
    delete rest[p.id]
    setAi({ applied: rest })
    toast('Desfeito', 'info')
  }

  return (
    <div className="ml-8 rounded-xl p-3" style={{ background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line)' }} data-testid={`proposal-${p.kind}`}>
      <div className="mb-1 flex items-center gap-2">
        <span className="label mb-0">{KIND_LABEL[p.kind]}</span>
        {'section' in p && <span className="chip">{p.section}</span>}
        {p.kind === 'song' && p.title && <span className="chip">{p.title}</span>}
      </div>
      {p.kind === 'progression' && (
        <div className="flex flex-wrap gap-1.5">
          {p.chords.map((c, i) => (
            <span key={i} className="rounded-md px-2 py-1 font-display text-base font-semibold" style={{ background: 'var(--surface-3)' }}>
              {fmt.chord(c.symbol)}
              <span className="ml-1 text-[10px] font-normal text-[var(--faint)]">{c.beats}t</span>
            </span>
          ))}
        </div>
      )}
      {p.kind === 'melody' && <MelodyPreview notes={p.notes} />}
      {p.kind === 'lyrics' && <pre className="whitespace-pre-wrap font-sans leading-relaxed">{p.lyrics}</pre>}
      {p.kind === 'song' && (
        <div className="flex flex-col gap-1">
          {p.sections.map((s) => (
            <div key={s.name}>
              <b>{s.name}</b>: <span className="text-[var(--muted)]">{s.chords.map((c) => fmt.chord(c.symbol)).join(' – ')}</span>
              {s.lyrics && <pre className="mt-0.5 whitespace-pre-wrap font-sans text-xs text-[var(--muted)]">{s.lyrics}</pre>}
            </div>
          ))}
          <div className="text-xs text-[var(--faint)]">Forma: {p.form.join(' – ')}</div>
        </div>
      )}
      {p.explanation && <p className="mt-1.5 text-xs text-[var(--muted)]">{p.explanation}</p>}
      <div className="mt-2 flex gap-1.5">
        {p.kind !== 'lyrics' && (
          <button className="btn py-1 text-xs" onClick={() => void listen()}>
            ▶ Ouvir
          </button>
        )}
        {applied ? (
          <button className="btn py-1 text-xs" onClick={undo} data-testid="proposal-undo">
            ↶ Desfazer
          </button>
        ) : (
          <button className="btn btn-primary py-1 text-xs" onClick={apply} data-testid="proposal-apply">
            {p.kind === 'song' ? 'Aplicar (substitui a música)' : 'Aplicar'}
          </button>
        )}
      </div>
    </div>
  )
}

/** Tiny piano-roll of a proposed melody. */
function MelodyPreview({ notes }: { notes: { midi: number; start: number; duration: number }[] }) {
  if (!notes.length) return null
  const lo = Math.min(...notes.map((n) => n.midi)) - 1
  const hi = Math.max(...notes.map((n) => n.midi)) + 1
  const end = Math.max(...notes.map((n) => n.start + n.duration))
  const W = 320
  const H = Math.min(110, Math.max(50, (hi - lo) * 5))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[420px] rounded-md" style={{ background: 'var(--surface-3)' }} aria-label={`Melodia com ${notes.length} notas`}>
      {Array.from({ length: Math.ceil(end / PPQ) + 1 }, (_, b) => (
        <line key={b} x1={(b * PPQ * W) / end} x2={(b * PPQ * W) / end} y1={0} y2={H} stroke={b % 4 === 0 ? '#4a5260' : '#2e3542'} />
      ))}
      {notes.map((n, i) => (
        <rect key={i} x={(n.start / end) * W} y={((hi - n.midi) / (hi - lo)) * (H - 6)} width={Math.max(2, (n.duration / end) * W - 1)} height={5} rx={1.5} fill="#f5a524" />
      ))}
    </svg>
  )
}
