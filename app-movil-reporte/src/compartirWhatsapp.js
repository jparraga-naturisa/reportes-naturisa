import Share from 'react-native-share';

export async function compartirWhatsapp(uri, mensaje, dialogTitle) {
  try {
    await Share.shareSingle({ message: mensaje, url: uri, social: Share.Social.WHATSAPP, failOnCancel: false });
  } catch (errWhatsapp) {
    // WhatsApp no está instalado: se ofrece el menú general de compartir en su lugar.
    await Share.open({ message: mensaje, url: uri, title: dialogTitle, failOnCancel: false });
  }
}

export async function compartirWhatsappTexto(mensaje) {
  try {
    await Share.shareSingle({ message: mensaje, social: Share.Social.WHATSAPP, failOnCancel: false });
  } catch (errWhatsapp) {
    await Share.open({ message: mensaje, failOnCancel: false });
  }
}
