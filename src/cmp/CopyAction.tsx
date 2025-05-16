import { Action, Clipboard, showToast, Toast } from '@raycast/api'
import { ComponentProps, useCallback } from 'react'

type Props = Omit<ComponentProps<typeof Action>, 'onAction' | 'id'> & {
  getText(): string
  noToast?: boolean
}

export function CopyAction(props: Props) {
  const { getText, noToast, ...rest } = props
  const onAction = useCallback(async () => {
    await Clipboard.copy(getText())
    if (!noToast) showToast({ title: 'Text copied to clipboard', style: Toast.Style.Success })
  }, [getText, noToast])

  return <Action {...rest} onAction={onAction} />
}
