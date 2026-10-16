import { NativeTabs } from "expo-router/native-tabs";
import { useKleuren } from "@/components/ui";

/** De vijf tabbladen: dezelfde als de onderbalk van de webapp op de telefoon. */
export default function TabLayout() {
  const k = useKleuren();
  return (
    <NativeTabs backgroundColor={k.wit} tintColor={k.primairTekst} labelStyle={{ selected: { color: k.primairTekst } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Overzicht</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="bank">
        <NativeTabs.Trigger.Label>Bank</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "building.columns", selected: "building.columns.fill" }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="bonnen">
        <NativeTabs.Trigger.Label>Bonnen</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "camera", selected: "camera.fill" }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="facturen">
        <NativeTabs.Trigger.Label>Facturen</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "doc.text", selected: "doc.text.fill" }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="meer">
        <NativeTabs.Trigger.Label>Meer</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="ellipsis" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
