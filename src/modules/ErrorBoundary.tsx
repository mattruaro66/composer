import { Component, type ReactNode } from 'react'

/** Isolates a module: if it crashes, the rest of the app keeps working. */
export class ErrorBoundary extends Component<{ children: ReactNode; name: string }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error(`[module ${this.props.name}]`, error)
  }
  render() {
    if (this.state.error)
      return (
        <div className="p-2 text-sm text-red-300">
          O módulo “{this.props.name}” encontrou um erro e foi isolado.
          <button className="btn ml-2" onClick={() => this.setState({ error: null })}>
            Tentar de novo
          </button>
        </div>
      )
    return this.props.children
  }
}
