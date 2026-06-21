/**
 * Scavenge 模块图标注册
 *
 * 解决 Iconify 默认从网络拉取图标导致离线/网络异常时图标消失的问题。
 * 启动时把所有用到的图标预注册到 Iconify 内部 collection，
 * 这样 <Icon icon="material-symbols:xxx" /> 字符串引用也能离线工作。
 *
 * 在 App 启动入口 import 这个文件一次即可。
 */
import { addCollection } from '@iconify/react';

// 角色状态图标
import favorite from '@iconify-icons/material-symbols/favorite';
import restaurant from '@iconify-icons/material-symbols/restaurant';
import waterDrop from '@iconify-icons/material-symbols/water-drop';
import psychology from '@iconify-icons/material-symbols/psychology';
import localFireDepartment from '@iconify-icons/material-symbols/local-fire-department';
import person from '@iconify-icons/material-symbols/person';
import close from '@iconify-icons/material-symbols/close';
import backpack from '@iconify-icons/material-symbols/backpack-outline';

// 物品图标（来自 items.ts 中使用的字符串）
import nutritionOutline from '@iconify-icons/material-symbols/nutrition-outline';
import waterDropOutline from '@iconify-icons/material-symbols/water-drop-outline';
import coffeeOutline from '@iconify-icons/material-symbols/coffee-outline';
import healingOutline from '@iconify-icons/material-symbols/healing-outline';
import medicationOutline from '@iconify-icons/material-symbols/medication-outline';
import medicalServicesOutline from '@iconify-icons/material-symbols/medical-services-outline';
import psychologyOutline from '@iconify-icons/material-symbols/psychology-outline';
import buildOutline from '@iconify-icons/material-symbols/build-outline';
import handymanOutline from '@iconify-icons/material-symbols/handyman-outline';
import checkroom from '@iconify-icons/material-symbols/checkroom';
import hardwareOutline from '@iconify-icons/material-symbols/hardware-outline';
import memoryOutline from '@iconify-icons/material-symbols/memory-outline';
import sportsBaseballOutline from '@iconify-icons/material-symbols/sports-baseball-outline';
import construction from '@iconify-icons/material-symbols/construction';
import contentCut from '@iconify-icons/material-symbols/content-cut';
import forestOutline from '@iconify-icons/material-symbols/forest-outline';
import gavel from '@iconify-icons/material-symbols/gavel';
import shieldOutline from '@iconify-icons/material-symbols/shield-outline';
import militaryTechOutline from '@iconify-icons/material-symbols/military-tech-outline';
import security from '@iconify-icons/material-symbols/security';
import flashlightOnOutline from '@iconify-icons/material-symbols/flashlight-on-outline';
import lockOutline from '@iconify-icons/material-symbols/lock-outline';
import visibilityOutline from '@iconify-icons/material-symbols/visibility-outline';
import keyOutline from '@iconify-icons/material-symbols/key-outline';
import mapOutline from '@iconify-icons/material-symbols/map-outline';
import checkCircleOutline from '@iconify-icons/material-symbols/check-circle-outline';
import build from '@iconify-icons/material-symbols/build';
import deleteOutline from '@iconify-icons/material-symbols/delete-outline';
import questionMark from '@iconify-icons/material-symbols/question-mark';
import kingBed from '@iconify-icons/material-symbols/king-bed';
import bed from '@iconify-icons/material-symbols/bed';
import kitchen from '@iconify-icons/material-symbols/kitchen';
import bathOutdoor from '@iconify-icons/material-symbols/bath-outdoor';
import chair from '@iconify-icons/material-symbols/chair';
import stairs from '@iconify-icons/material-symbols/stairs';
import doorBack from '@iconify-icons/material-symbols/door-back';
import logout from '@iconify-icons/material-symbols/logout';
import exitToApp from '@iconify-icons/material-symbols/exit-to-app';
import doorFront from '@iconify-icons/material-symbols/door-front';
import home from '@iconify-icons/material-symbols/home';
import bathroom from '@iconify-icons/material-symbols/bathroom';
import bedOutline from '@iconify-icons/material-symbols/bed-outline';

// 地图/仓库/时间控件图标
import locationOn from '@iconify-icons/material-symbols/location-on';
import lock from '@iconify-icons/material-symbols/lock';
import inventory from '@iconify-icons/material-symbols/inventory';
import schedule from '@iconify-icons/material-symbols/schedule';
import warehouseOutline from '@iconify-icons/material-symbols/warehouse-outline';

const materialSymbolsCollection = {
  prefix: 'material-symbols',
  icons: {
    'favorite': favorite,
    'restaurant': restaurant,
    'water-drop': waterDrop,
    'water-drop-outline': waterDropOutline,
    'psychology': psychology,
    'local-fire-department': localFireDepartment,
    'person': person,
    'close': close,
    'backpack-outline': backpack,
    'nutrition-outline': nutritionOutline,
    'coffee-outline': coffeeOutline,
    'healing-outline': healingOutline,
    'medication-outline': medicationOutline,
    'medical-services-outline': medicalServicesOutline,
    'psychology-outline': psychologyOutline,
    'build-outline': buildOutline,
    'build': build,
    'handyman-outline': handymanOutline,
    'checkroom': checkroom,
    'checkroom-outline': checkroom,
    'hardware-outline': hardwareOutline,
    'memory-outline': memoryOutline,
    'sports-baseball-outline': sportsBaseballOutline,
    'construction': construction,
    'construction-outline': construction,
    'content-cut': contentCut,
    'content-cut-outline': contentCut,
    'forest-outline': forestOutline,
    'gavel': gavel,
    'weapon-outline': gavel,
    'shield-outline': shieldOutline,
    'military-tech-outline': militaryTechOutline,
    'security': security,
    'security-tech-outline': security,
    'flashlight-on-outline': flashlightOnOutline,
    'lock-outline': lockOutline,
    'lock': lock,
    'visibility-outline': visibilityOutline,
    'key-outline': keyOutline,
    'map-outline': mapOutline,
    'check-circle-outline': checkCircleOutline,
    'delete-outline': deleteOutline,
    'question-mark': questionMark,
    'king-bed': kingBed,
    'bed': bed,
    'bed-outline': bedOutline,
    'kitchen': kitchen,
    'bathroom': bathroom,
    'bath-outdoor': bathOutdoor,
    'chair': chair,
    'home': home,
    'stairs': stairs,
    'door-back': doorBack,
    'door-front': doorFront,
    'logout': logout,
    'exit-to-app': exitToApp,
    'location-on': locationOn,
    'inventory': inventory,
    'schedule': schedule,
    'warehouse-outline': warehouseOutline,
  } as Record<string, any>,
};

addCollection(materialSymbolsCollection);
