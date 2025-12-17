'use client';

import { useCollabStore } from '@/lib/collaboration-store';

export function UserAvatars() {
    const others = useCollabStore((state) => state.liveblocks.others);
    const currentUser = useCollabStore((state) => state.user);
    const userCount = others.length;

    return (
        <div className="flex items-center gap-2 sm:gap-3">
            {/* 아바타 스택 */}
            <div className="flex -space-x-2">
                {/* 현재 사용자 (나) */}
                <div
                    className="relative flex h-8 w-8 sm:h-8 sm:w-8 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-sm"
                    style={{ backgroundColor: currentUser.color }}
                    title={`${currentUser.name} (나)`}
                >
                    {currentUser.name[0]?.toUpperCase() || '?'}
                    {/* 온라인 표시 */}
                    <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full border-2 border-white bg-green-500" />
                </div>

                {/* 다른 사용자들 (최대 3명 on mobile, 4명 on desktop) */}
                {others.slice(0, 3).map((other, i) => {
                    const user = other.presence?.user;
                    if (!user) return null;

                    return (
                        <div
                            key={i}
                            className="flex h-8 w-8 sm:h-8 sm:w-8 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-sm"
                            style={{ backgroundColor: user.color || '#888' }}
                            title={user.name}
                        >
                            {user.name?.[0]?.toUpperCase() || '?'}
                        </div>
                    );
                })}

                {/* 추가 사용자 표시 (+N) */}
                {userCount > 3 && (
                    <div
                        className="flex h-8 w-8 sm:h-8 sm:w-8 items-center justify-center rounded-full border-2 border-white bg-gray-400 text-xs font-bold text-white shadow-sm"
                        title={`+${userCount - 3}명 더`}
                    >
                        +{userCount - 3}
                    </div>
                )}
            </div>

            {/* 접속자 수 텍스트 - 모바일에서는 숨김 */}
            <span className="hidden sm:inline text-sm font-medium text-gray-600">
                {userCount + 1}명 접속 중
            </span>
        </div>
    );
}
