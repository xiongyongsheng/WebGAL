import { useEffect } from 'react';
import { initializeScript } from '@/Core/initializeScript';
// 注册 Scavenge 模块的所有图标到 Iconify（必须最先导入）
import '@/UI/Scavenge/iconRegistry';
import Translation from '@/UI/Translation/Translation';
import { Stage } from '@/Stage/Stage';
import { BottomControlPanel } from '@/UI/BottomControlPanel/BottomControlPanel';
import { BottomControlPanelFilm } from '@/UI/BottomControlPanel/BottomControlPanelFilm';
import { Backlog } from '@/UI/Backlog/Backlog';
import Title from '@/UI/Title/Title';
import Logo from '@/UI/Logo/Logo';
import { Extra } from '@/UI/Extra/Extra';
import Menu from '@/UI/Menu/Menu';
import GlobalDialog from '@/UI/GlobalDialog/GlobalDialog';
import PanicOverlay from '@/UI/PanicOverlay/PanicOverlay';
import DevPanel from '@/UI/DevPanel/DevPanel';
import { ScavengeMain } from '@/UI/Scavenge/ScavengeMain';
import { SafehouseCharacterPanel } from '@/UI/Scavenge/Safehouse/SafehouseCharacterPanel';

export default function App() {
  useEffect(() => {
    initializeScript();
  }, []);
  return (
    <div className="App">
      <Translation />
      <Stage />
      <ScavengeMain />
      <SafehouseCharacterPanel />
      <BottomControlPanel />
      <BottomControlPanelFilm />
      <Backlog />
      <Title />
      <Logo />
      <Extra />
      <Menu />
      <GlobalDialog />
      <PanicOverlay />
      <DevPanel />
    </div>
  );
}
