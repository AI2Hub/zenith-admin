import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatLeftPane } from './ChatLeftPane';

/**
 * 「会话」页签的未读徽标：
 *  1. 未读总数为 0 时不渲染数量徽标（Semi Badge 只在 count 为 undefined / null 时隐藏，0 会显示「0」）
 *  2. 有未读时展示真实数量
 */

type LeftPaneProps = Parameters<typeof ChatLeftPane>[0];

const noop = () => undefined;

function baseProps(totalUnread: number): LeftPaneProps {
  return {
    isQuick: false,
    activeConvId: null,
    totalUnread,
    openDiscover: noop,
    showNewChat: false,
    setShowNewChat: noop,
    handleNewDirectChat: async () => undefined,
    handleGroupCreated: noop,
    convSearch: '',
    setConvSearch: noop,
    leftPaneMode: 'conversations',
    setLeftPaneMode: noop,
    loadingConvs: false,
    showArchiveToggle: false,
    showArchived: false,
    setShowArchived: noop,
    archivedConvs: [],
    archivedUnread: 0,
    leftListItems: [],
    listRowProps: {
      activeChannelId: null,
      activeConvId: null,
      groupAvatarMap: {},
      onlineUserIds: new Set<number>(),
      failedMessages: [],
      draftsMap: {},
      channelAvatarNode: () => null,
      setActiveChannelId: noop,
      setActiveConvId: noop,
      setChannels: noop,
      handleSelectConv: async () => undefined,
      setLeftPaneContextMenu: noop,
    },
    favoriteMessages: [],
    conversations: [],
    setFavPreviewMsg: noop,
    setFavPreviewVisible: noop,
    globalSearch: {
      globalSearchKeyword: '',
      setGlobalSearchKeyword: noop,
      setGlobalSearchResults: noop,
      setGlobalSearchTotal: noop,
      setGlobalSearchHasSearched: noop,
      setGlobalSearchLoading: noop,
      globalSearchLoading: false,
      globalSearchHasSearched: false,
      globalSearchTotal: 0,
      globalSearchResults: [],
      globalSearchPage: 1,
      setGlobalSearchPage: noop,
      globalSearchConvNames: {},
      setGlobalSearchConvNames: noop,
      onOpenSearchResult: async () => undefined,
    },
    leftPaneContextMenu: null,
    setLeftPaneContextMenu: noop,
    contextMenuProps: {
      setConversations: noop,
      activeConvId: null,
      setActiveConvId: noop,
      setMessages: noop,
      setPendingNewMsgCount: noop,
      openFavoriteMessage: async () => undefined,
      setFavPreviewVisible: noop,
      handleToggleFavorite: async () => undefined,
      handleTogglePinMessage: async () => undefined,
      canPinMessage: () => true,
      handleUnsubscribeChannel: noop,
    },
  };
}

const badgeCount = () => document.querySelector('.semi-badge-count');

describe('ChatLeftPane 会话页签未读徽标', () => {
  it('未读总数为 0 时不显示数量徽标', () => {
    render(<ChatLeftPane {...baseProps(0)} />);

    expect(screen.getByText('会话')).toBeTruthy();
    expect(badgeCount()).toBeNull();
  });

  it('有未读时显示未读数量，超过 99 显示 99+', () => {
    const { rerender } = render(<ChatLeftPane {...baseProps(5)} />);
    expect(badgeCount()?.textContent).toBe('5');

    rerender(<ChatLeftPane {...baseProps(120)} />);
    expect(badgeCount()?.textContent).toBe('99+');
  });
});
