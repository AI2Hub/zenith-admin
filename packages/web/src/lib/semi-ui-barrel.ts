/**
 * @douyinfe/semi-ui 的本地影子 barrel（无副作用版）。
 *
 * Semi 官方把 `lib/es/index.js` 声明为 sideEffect（因其内联 `import './_base/base.css'`），
 * 导致 `import { Button } from '@douyinfe/semi-ui'` 会强制求值全量 re-export，
 * aiChatDialogue（tiptap/prosemirror）、MarkdownRender（acorn）等重组件即使无人使用
 * 也会进入首屏静态图（实测 ~550KB gzip）。
 *
 * vite.config.ts 通过 exact-match alias 把裸导入 `@douyinfe/semi-ui` 指到本文件；
 * 本文件与官方 barrel 的导出一一对应，但不含 css 副作用（base.css 由各入口显式引入），
 * 且未被声明为 sideEffect，可被正常摇树。子路径导入（lib/es/*、react19-adapter）不受影响。
 *
 * ⚠️ Semi 升级新增顶层导出时，需在此同步补一行（缺失会在构建/运行时立即暴露）。
 */
export { default as BaseFoundation } from '@douyinfe/semi-foundation/lib/es/base/foundation';
export { default as BaseComponent } from '@douyinfe/semi-ui/lib/es/_base/baseComponent';
export { default as Anchor } from '@douyinfe/semi-ui/lib/es/anchor';
export { default as AutoComplete } from '@douyinfe/semi-ui/lib/es/autoComplete';
export { default as Avatar } from '@douyinfe/semi-ui/lib/es/avatar';
export { default as AvatarGroup } from '@douyinfe/semi-ui/lib/es/avatar/avatarGroup';
export { default as BackTop } from '@douyinfe/semi-ui/lib/es/backtop';
export { default as Badge } from '@douyinfe/semi-ui/lib/es/badge';
export { default as Banner } from '@douyinfe/semi-ui/lib/es/banner';
export { default as Breadcrumb } from '@douyinfe/semi-ui/lib/es/breadcrumb';
export { default as Button } from '@douyinfe/semi-ui/lib/es/button';
export { default as ButtonGroup } from '@douyinfe/semi-ui/lib/es/button/buttonGroup';
export { default as Calendar } from '@douyinfe/semi-ui/lib/es/calendar';
export { default as Card } from '@douyinfe/semi-ui/lib/es/card';
export { default as CardGroup } from '@douyinfe/semi-ui/lib/es/card/cardGroup';
export { default as Carousel } from '@douyinfe/semi-ui/lib/es/carousel';
export { default as Cascader } from '@douyinfe/semi-ui/lib/es/cascader';
export { default as Checkbox } from '@douyinfe/semi-ui/lib/es/checkbox';
export { default as CheckboxGroup } from '@douyinfe/semi-ui/lib/es/checkbox/checkboxGroup';
export { default as Collapse } from '@douyinfe/semi-ui/lib/es/collapse';
export { default as Collapsible } from '@douyinfe/semi-ui/lib/es/collapsible';
export { default as ConfigProvider } from '@douyinfe/semi-ui/lib/es/configProvider';
export { ConfigConsumer } from '@douyinfe/semi-ui/lib/es/configProvider';
export { default as DatePicker } from '@douyinfe/semi-ui/lib/es/datePicker';
export { default as Descriptions } from '@douyinfe/semi-ui/lib/es/descriptions';
export { default as Divider } from '@douyinfe/semi-ui/lib/es/divider';
export { default as Empty } from '@douyinfe/semi-ui/lib/es/empty';
export { default as Modal } from '@douyinfe/semi-ui/lib/es/modal';
export { default as Dropdown } from '@douyinfe/semi-ui/lib/es/dropdown';
export { default as DropdownMenu } from '@douyinfe/semi-ui/lib/es/dropdown/dropdownMenu';
export { default as DropdownItem } from '@douyinfe/semi-ui/lib/es/dropdown/dropdownItem';
export { default as DropdownDivider } from '@douyinfe/semi-ui/lib/es/dropdown/dropdownDivider';
export { Row, Col } from '@douyinfe/semi-ui/lib/es/grid';
export { Layout } from '@douyinfe/semi-ui/lib/es/layout';
export { default as List } from '@douyinfe/semi-ui/lib/es/list';
export { default as IconButton } from '@douyinfe/semi-ui/lib/es/iconButton';
export { default as Icon } from '@douyinfe/semi-ui/lib/es/icons';
export { default as Input } from '@douyinfe/semi-ui/lib/es/input';
export { default as InputGroup } from '@douyinfe/semi-ui/lib/es/input/inputGroup';
export { default as TextArea } from '@douyinfe/semi-ui/lib/es/input/textarea';
export { default as InputNumber } from '@douyinfe/semi-ui/lib/es/inputNumber';
export { default as Nav } from '@douyinfe/semi-ui/lib/es/navigation';
export { default as NavItem } from '@douyinfe/semi-ui/lib/es/navigation/Item';
export { default as SubNav } from '@douyinfe/semi-ui/lib/es/navigation/SubNav';
export { default as Notification } from '@douyinfe/semi-ui/lib/es/notification';
export { default as OverflowList } from '@douyinfe/semi-ui/lib/es/overflowList';
export { default as Pagination } from '@douyinfe/semi-ui/lib/es/pagination';
export { default as Popconfirm } from '@douyinfe/semi-ui/lib/es/popconfirm';
export { default as Popover } from '@douyinfe/semi-ui/lib/es/popover';
export { default as Progress } from '@douyinfe/semi-ui/lib/es/progress';
export { default as Radio } from '@douyinfe/semi-ui/lib/es/radio';
export { default as RadioGroup } from '@douyinfe/semi-ui/lib/es/radio/radioGroup';
export { default as Rating } from '@douyinfe/semi-ui/lib/es/rating';
export { default as ScrollList } from '@douyinfe/semi-ui/lib/es/scrollList';
export { default as ScrollItem } from '@douyinfe/semi-ui/lib/es/scrollList/scrollItem';
export { default as Select } from '@douyinfe/semi-ui/lib/es/select';
export { default as SideSheet } from '@douyinfe/semi-ui/lib/es/sideSheet';
export { default as Skeleton } from '@douyinfe/semi-ui/lib/es/skeleton';
export { default as Slider } from '@douyinfe/semi-ui/lib/es/slider';
export { default as Space } from '@douyinfe/semi-ui/lib/es/space';
export { default as Spin } from '@douyinfe/semi-ui/lib/es/spin';
export { default as SplitButtonGroup } from '@douyinfe/semi-ui/lib/es/button/splitButtonGroup';
export { default as Step } from '@douyinfe/semi-ui/lib/es/steps/step';
export { default as Steps } from '@douyinfe/semi-ui/lib/es/steps';
export { default as Switch } from '@douyinfe/semi-ui/lib/es/switch';
export { default as Table } from '@douyinfe/semi-ui/lib/es/table';
export { default as Tabs } from '@douyinfe/semi-ui/lib/es/tabs';
export { default as TabPane } from '@douyinfe/semi-ui/lib/es/tabs/TabPane';
export { default as Tag } from '@douyinfe/semi-ui/lib/es/tag';
export { default as TagGroup } from '@douyinfe/semi-ui/lib/es/tag/group';
export { default as SplitTagGroup } from '@douyinfe/semi-ui/lib/es/tag/splitTagGroup';
export { default as TagInput } from '@douyinfe/semi-ui/lib/es/tagInput';
export { default as Timeline } from '@douyinfe/semi-ui/lib/es/timeline';
export { default as TimePicker } from '@douyinfe/semi-ui/lib/es/timePicker';
export { default as Toast, ToastFactory } from '@douyinfe/semi-ui/lib/es/toast';
export { default as Tooltip } from '@douyinfe/semi-ui/lib/es/tooltip';
export { default as Tree } from '@douyinfe/semi-ui/lib/es/tree';
export { default as TreeSelect } from '@douyinfe/semi-ui/lib/es/treeSelect';
export { default as Upload } from '@douyinfe/semi-ui/lib/es/upload';
export { default as Typography } from '@douyinfe/semi-ui/lib/es/typography';
export { default as Transfer } from '@douyinfe/semi-ui/lib/es/transfer';
export { default as Highlight } from '@douyinfe/semi-ui/lib/es/highlight';
export { default as LocaleProvider } from '@douyinfe/semi-ui/lib/es/locale/localeProvider';
export { default as LocaleConsumer } from '@douyinfe/semi-ui/lib/es/locale/localeConsumer';
/** Form */
export { Form, useFormApi, useFormState, useFieldApi, useFieldState, withFormState, withFormApi, withField, ArrayField } from '@douyinfe/semi-ui/lib/es/form';
export { default as Image } from '@douyinfe/semi-ui/lib/es/image';
export { Preview as ImagePreview } from '@douyinfe/semi-ui/lib/es/image';
export { default as semiGlobal } from '@douyinfe/semi-ui/lib/es/_utils/semi-global';
export { default as ColorPicker } from '@douyinfe/semi-ui/lib/es/colorPicker';
export { default as PinCode } from '@douyinfe/semi-ui/lib/es/pincode';
export { default as MarkdownRender } from '@douyinfe/semi-ui/lib/es/markdownRender';
export { default as CodeHighlight } from '@douyinfe/semi-ui/lib/es/codeHighlight';
export { default as Lottie } from '@douyinfe/semi-ui/lib/es/lottie';
export { default as Chat } from '@douyinfe/semi-ui/lib/es/chat';
export { default as HotKeys } from '@douyinfe/semi-ui/lib/es/hotKeys';
export { Resizable, ResizeItem, ResizeHandler, ResizeGroup } from '@douyinfe/semi-ui/lib/es/resizable';
export { default as JsonViewer } from '@douyinfe/semi-ui/lib/es/jsonViewer';
export { default as DragMove } from '@douyinfe/semi-ui/lib/es/dragMove';
export { default as Cropper } from '@douyinfe/semi-ui/lib/es/cropper';
export { default as AudioPlayer } from '@douyinfe/semi-ui/lib/es/audioPlayer';
export { default as UserGuide } from '@douyinfe/semi-ui/lib/es/userGuide';
export { default as VideoPlayer } from '@douyinfe/semi-ui/lib/es/videoPlayer';
export { default as Feedback } from '@douyinfe/semi-ui/lib/es/feedback';
export { default as FloatButton } from '@douyinfe/semi-ui/lib/es/floatButton';
export { default as FloatButtonGroup } from '@douyinfe/semi-ui/lib/es/floatButton/floatButtonGroup';
export { default as AIChatDialogue } from '@douyinfe/semi-ui/lib/es/aiChatDialogue';
export { default as AIChatInput, getConfigureItem } from '@douyinfe/semi-ui/lib/es/aiChatInput';
export { chatCompletionToMessage, streamingChatCompletionToMessage, streamingResponseToMessage, responseToMessage, chatInputToMessage, chatInputToChatCompletion } from '@douyinfe/semi-foundation/lib/es/aiChatDialogue/dataAdapter';
export { default as MCPConfigure } from '@douyinfe/semi-ui/lib/es/sideBar/mcpConfigure';
export { default as Annotation } from '@douyinfe/semi-ui/lib/es/sideBar/annotation';
export { default as Sidebar } from '@douyinfe/semi-ui/lib/es/sideBar';
