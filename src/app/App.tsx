import { WorkspacePage } from '../pages/workspace/WorkspacePage'
import { I18nProvider } from '../shared/i18n/I18nProvider'

export function App(): React.JSX.Element {
  return (
    <I18nProvider>
      <WorkspacePage />
    </I18nProvider>
  )
}
