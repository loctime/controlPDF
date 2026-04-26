"use client"

import { Component, type ReactNode } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ErrorBoundaryProps {
  children: ReactNode
  resetKey?: string | number
  onReset?: () => void
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  componentDidCatch(error: Error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[ErrorBoundary]", error)
    }
  }

  handleReset = () => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3"
      >
        <div className="flex items-center justify-center text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div>
          <p className="font-medium text-foreground">Algo salió mal</p>
          <p className="mt-1 text-sm text-muted-foreground break-words">
            {error.message || "Ocurrió un error inesperado en esta herramienta."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={this.handleReset}>
          Reiniciar herramienta
        </Button>
      </div>
    )
  }
}
