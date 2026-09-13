export const pageTypes = [
	{ id: 'landing', name: '产品落地页', hint: '讲清价值，引导行动', prompt: '本次页面类型：产品落地页。突出一个核心价值，按阅读顺序组织卖点，并提供清楚的主要行动入口。' },
	{ id: 'portfolio', name: '作品展示', hint: '让作品与故事成为主角', prompt: '本次页面类型：作品展示。突出代表作品与创作说明，建立清楚的浏览顺序，保留联系或进一步了解的入口。' },
	{ id: 'dashboard', name: '工作看板', hint: '快速看懂，方便操作', prompt: '本次页面类型：工作看板。优先呈现任务或数据状态，信息便于扫描，重要操作清楚可达。' },
	{ id: 'article', name: '内容阅读', hint: '舒适阅读，容易查找', prompt: '本次页面类型：内容阅读。以标题层级、合适行宽与段落节奏组织信息，让导航和延伸内容容易查找。' },
];
export const designStyles = [
	{ id: 'clear', name: '清晰现代', hint: '克制配色，清楚层级', prompt: '设计方向：清晰现代。使用克制的中性色与单一强调色，留白适中，文字和操作层级清楚，装饰服务于内容。' },
	{ id: 'editorial', name: '杂志排版', hint: '大标题，留白，少卡片', prompt: '设计方向：杂志排版。使用醒目的标题、充足留白与明确阅读顺序，优先用排版和分隔线组织内容，减少重复圆角卡片。' },
	{ id: 'bold', name: '鲜明有力', hint: '强对比，大字，重点突出', prompt: '设计方向：鲜明有力。用强烈明暗对比、大标题与少量高辨识强调色建立重点，保持正文易读和操作可辨识。' },
	{ id: 'warm', name: '温暖亲和', hint: '柔和色彩，轻松自然', prompt: '设计方向：温暖亲和。使用柔和暖色、自然间距与适度圆角，让界面轻松友好，同时保留清楚的信息层级与对比度。' },
];

export function DesignStart({ pageType, direction, onType, onDirection }: { pageType: string; direction: string; onType: (id: string) => void; onDirection: (id: string) => void }) {
	return <details className="rsi-design-start" open>
		<summary>还没想好？从一个设计方向开始</summary>
		<small>先选用途，再选感觉；也可以跳过，直接描述。点击已选卡片可取消。</small>
		<fieldset><legend>页面用途</legend><div className="rsi-design-options">{pageTypes.map(option => <button type="button" key={option.id} aria-pressed={pageType === option.id} onClick={() => onType(pageType === option.id ? '' : option.id)}>
			<span aria-hidden="true" className={`rsi-design-preview rsi-type-${option.id}`}><i /><b /><em /><span /></span><strong>{option.name}</strong><small>{option.hint}</small>
		</button>)}</div></fieldset>
		<fieldset><legend>视觉感觉</legend><div className="rsi-design-options">{designStyles.map(option => <button type="button" key={option.id} aria-pressed={direction === option.id} onClick={() => onDirection(direction === option.id ? '' : option.id)}>
			<span aria-hidden="true" className={`rsi-design-preview rsi-style-${option.id}`}><i /><b>Aa</b><em /><span /></span><strong>{option.name}</strong><small>{option.hint}</small>
		</button>)}</div></fieldset>
		<small>卡片只是视觉示意，选择本身不调用模型；具体设计可在下方补充。</small>
	</details>;
}
