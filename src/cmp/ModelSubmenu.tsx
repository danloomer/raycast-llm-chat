import { useEffect, useState } from 'react'

import { ActionPanel, Icon, Action } from '@raycast/api'
import { ModelId, providers } from '../lib/llm'

interface Props {
  value: ModelId
  onChange(newValue: ModelId): void
}

export function ModelSubmenu({ value, onChange }: Props) {
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, string[]>>({})
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchModels() {
      const entries = await Promise.all(
        providers.map(
          async (provider) => [provider.name, await provider.getModels()] as [string, string[]],
        ),
      )
      setModelsByProvider(Object.fromEntries(entries))
      setIsLoading(false)
    }
    fetchModels()
  }, [])

  return (
    <ActionPanel.Submenu
      title={`Change Model (${value})`}
      icon={Icon.ComputerChip}
      shortcut={{ modifiers: ['cmd'], key: 'm' }}
    >
      {isLoading && (
        <ActionPanel.Section>
          <Action title="Loading models..." icon={Icon.Clock} />
        </ActionPanel.Section>
      )}

      {!isLoading &&
        providers.map((provider) => (
          <ActionPanel.Section key={provider.name} title={provider.name}>
            {(modelsByProvider[provider.name] || []).map((model) => (
              <Action
                key={model}
                title={model}
                icon={value === model ? Icon.Checkmark : Icon.Circle}
                onAction={() => onChange(model)}
              />
            ))}
          </ActionPanel.Section>
        ))}
    </ActionPanel.Submenu>
  )
}
