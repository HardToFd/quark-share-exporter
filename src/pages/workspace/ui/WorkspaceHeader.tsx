import { useState } from 'react'
import { Cloud, KeyRound, LoaderCircle, RefreshCw, ShieldCheck, UserRound } from 'lucide-react'
import { Badge, Button, Input } from '../../../shared/ui/Primitives'
import { formatBytes } from '../../../shared/lib/format'
import type { WorkspaceModel } from '../model/useWorkspaceModel'

export function WorkspaceHeader({ model }: { model: WorkspaceModel }): React.JSX.Element {
  const [token, setToken] = useState('')
  const { runtime, account, busy, manualCodeNeeded } = model

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__mark"><Cloud size={22} /></span>
        <div>
          <strong>QuarkLink</strong>
          <small>分享链批量导出</small>
        </div>
      </div>

      <div className="topbar__status">
        <div className="status-cluster">
          <Badge tone={runtime.verified ? 'success' : 'danger'}>
            <ShieldCheck size={13} />
            {runtime.verified ? `Skill ${runtime.skillVersion}` : '运行时异常'}
          </Badge>
          <span className="status-cluster__copy">{runtime.message}</span>
        </div>

        <div className="account-box">
          <span className={`account-box__avatar ${account.authenticated ? 'is-online' : ''}`}>
            <UserRound size={17} />
          </span>
          <div>
            <strong>{account.authenticated ? account.nickname : '尚未授权'}</strong>
            <small>
              {account.authenticated
                ? `${account.membership ?? '账号已连接'}${account.totalBytes ? ` · ${formatBytes(account.usedBytes)} / ${formatBytes(account.totalBytes)}` : ''}`
                : account.message}
            </small>
          </div>
          {account.authenticated ? (
            <Button variant="ghost" className="button--icon" onClick={() => void model.refreshAccount()} title="刷新账号状态">
              <RefreshCw size={16} className={busy === 'account' ? 'spin' : ''} />
            </Button>
          ) : (
            <Button onClick={() => void model.login()} disabled={busy === 'account'}>
              {busy === 'account' ? <LoaderCircle size={16} className="spin" /> : <KeyRound size={16} />}
              浏览器授权
            </Button>
          )}
        </div>
      </div>

      {manualCodeNeeded && !account.authenticated && (
        <div className="manual-auth">
          <div>
            <strong>浏览器授权没有自动回传？</strong>
            <span>完成授权后，从跳转地址复制 <b>code</b> 参数，粘贴到这里。</span>
          </div>
          <Input value={token} onChange={(event) => setToken(event.target.value)} placeholder="粘贴授权码" />
          <Button onClick={() => void model.login(token)} disabled={!token.trim() || busy === 'account'}>
            提交授权码
          </Button>
        </div>
      )}
    </header>
  )
}
