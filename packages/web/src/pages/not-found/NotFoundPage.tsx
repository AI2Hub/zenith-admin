import { useNavigate } from 'react-router-dom';
import { Button, Empty } from '@douyinfe/semi-ui';
import { IllustrationNotFound, IllustrationNotFoundDark } from '@douyinfe/semi-illustrations';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <Empty
        image={<IllustrationNotFound style={{ width: 200, height: 200 }} />}
        darkModeImage={<IllustrationNotFoundDark style={{ width: 200, height: 200 }} />}
        title="页面不存在"
        description="您访问的页面不存在或已被移除，请检查地址是否正确"
      >
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
          <Button type="primary" onClick={() => navigate('/')}>返回首页</Button>
          <Button onClick={() => navigate(-1)}>返回上一页</Button>
        </div>
      </Empty>
    </div>
  );
}
